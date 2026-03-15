import { getServerEnv } from "../env/server-env";

const REDDIT_API_BASE = "https://oauth.reddit.com";

interface RedditTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export interface RedditPost {
  id: string;
  title: string;
  url: string;
  selftext: string;
  author: string;
  subreddit: string;
  ups: number;
  num_comments: number;
  created_utc: number;
  permalink: string;
  is_self: boolean;
}

export interface RedditSubreddit {
  id: string;
  name: string;
  display_name: string;
  subscribers: number;
  title: string;
  public_description: string;
}

// Response types for different endpoints
interface SubredditAboutResponse {
  data: RedditSubreddit;
}

interface PostListingResponse {
  data: {
    children: Array<{ data: RedditPost }>;
    after?: string;
  };
}

interface SubredditSearchResponse {
  data: {
    children: Array<{ data: RedditSubreddit }>;
    after?: string;
  };
}

export class RedditClient {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private clientId: string;
  private clientSecret: string;
  private userAgent: string;

  constructor() {
    const env = getServerEnv();
    this.clientId = env.REDDIT_CLIENT_ID;
    this.clientSecret = env.REDDIT_CLIENT_SECRET;
    this.userAgent = env.REDDIT_USER_AGENT;
  }

  private async getAccessToken(): Promise<string> {
    // Check if we have a valid token
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    // Get new token using client credentials flow
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");

    const response = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": this.userAgent,
      },
      body: "grant_type=client_credentials",
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get Reddit access token: ${error}`);
    }

    const data: RedditTokenResponse = await response.json();
    this.accessToken = data.access_token;
    // Set expiry with 60 second buffer
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;

    return this.accessToken!;
  }

  private async fetchReddit<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const token = await this.getAccessToken();

    const url = new URL(`${REDDIT_API_BASE}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": this.userAgent,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Reddit API error: ${error}`);
    }

    return response.json();
  }

  /**
   * Get hot posts from a subreddit
   */
  async getHotPosts(subreddit: string, limit: number = 25): Promise<RedditPost[]> {
    const data = await this.fetchReddit<PostListingResponse>(
      `/r/${subreddit}/hot.json`,
      { limit: limit.toString() }
    );

    return data.data.children.map((child) => child.data);
  }

  /**
   * Get new posts from a subreddit
   */
  async getNewPosts(subreddit: string, limit: number = 25): Promise<RedditPost[]> {
    const data = await this.fetchReddit<PostListingResponse>(
      `/r/${subreddit}/new.json`,
      { limit: limit.toString() }
    );

    return data.data.children.map((child) => child.data);
  }

  /**
   * Search for posts across Reddit
   */
  async searchPosts(query: string, limit: number = 25): Promise<RedditPost[]> {
    const data = await this.fetchReddit<PostListingResponse>(
      "/search.json",
      {
        q: query,
        limit: limit.toString(),
        sort: "relevance",
        t: "month", // Past month
      }
    );

    return data.data.children.map((child) => child.data);
  }

  /**
   * Search for subreddits by name
   */
  async searchSubreddits(query: string, limit: number = 10): Promise<RedditSubreddit[]> {
    const data = await this.fetchReddit<SubredditSearchResponse>(
      "/subreddits/search.json",
      {
        q: query,
        limit: limit.toString(),
      }
    );

    return data.data.children.map((child) => child.data);
  }

  /**
   * Get popular AI-related subreddits
   */
  async getPopularAISubreddits(): Promise<RedditSubreddit[]> {
    const aiSubreddits = [
      "ArtificialIntelligence",
      "ChatGPT",
      "LocalLLaMA",
      "OpenAI",
      "MachineLearning",
      "MLOps",
      "langchain",
      "LLMs",
      "AI_Agents",
      "promptengineering",
      "IndieAI",
      "BuildMeThis",
    ];

    const subreddits: RedditSubreddit[] = [];
    
    for (const name of aiSubreddits) {
      try {
        const data = await this.fetchReddit<SubredditAboutResponse>(
          `/r/${name}/about.json`
        );
        if (data?.data) {
          subreddits.push(data.data);
        }
      } catch {
        // Skip if subreddit doesn't exist
        console.warn(`Subreddit r/${name} not found, skipping`);
      }
    }

    return subreddits;
  }

  /**
   * Get a single post by ID
   */
  async getPost(postId: string): Promise<RedditPost> {
    const data = await this.fetchReddit<PostListingResponse>(
      `/api/info`,
      { id: postId }
    );

    if (data.data.children.length === 0) {
      throw new Error(`Post ${postId} not found`);
    }

    return data.data.children[0].data;
  }
}

// Singleton instance
let redditClient: RedditClient | null = null;

export function getRedditClient(): RedditClient {
  if (!redditClient) {
    redditClient = new RedditClient();
  }
  return redditClient;
}
