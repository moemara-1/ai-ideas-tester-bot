/**
 * Hacker News API Client
 * 
 * Official Hacker News API - completely open, no auth required
 * Base URL: https://hacker-news.firebaseio.com/v0/
 * 
 * Rate limits: ~10,000 requests/hour (generous, but we should still be respectful)
 */

export interface HNStory {
  id: number;
  title: string;
  url?: string;
  text?: string;
  by: string;
  score: number;
  time: number;
  descendants: number;
  kids?: number[];
  type: "story" | "job" | "poll";
  parent?: number;
  poll?: number;
  parts?: number[];
  deleted?: boolean;
  dead?: boolean;
}

export interface HNItem {
  id: number;
  type: "job" | "story" | "comment" | "poll" | "pollopt";
  by?: string;
  time?: number;
  text?: string;
  parent?: number;
  poll?: number;
  kids?: number[];
  url?: string;
  score?: number;
  title?: string;
  parts?: number[];
  deleted?: boolean;
  dead?: boolean;
}

// AI-related keywords to filter stories
const AI_KEYWORDS = [
  "ai", "gpt", "llm", "machine learning", "ml", "deep learning",
  "neural", "chatgpt", "openai", "anthropic", "claude", "gemini",
  "langchain", "llama", "mistral", "rAG", "vector", "embedding",
  "agent", "autonomous", "prompt", "fine-tuning", "transformer",
  "python", "javascript", "typescript", "react", "next.js",
  "api", "open source", "oss", "github", "huggingface"
];

const HN_API_BASE = "https://hacker-news.firebaseio.com/v0";

export class HackerNewsClient {
  private baseUrl = HN_API_BASE;

  /**
   * Get top stories from HN
   * @param limit Number of stories to fetch (max 500)
   */
  async getTopStories(limit: number = 50): Promise<HNStory[]> {
    const response = await fetch(`${this.baseUrl}/topstories.json`);
    if (!response.ok) {
      throw new Error(`HN API error: ${response.status}`);
    }
    
    const storyIds: number[] = await response.json();
    const limitedIds = storyIds.slice(0, limit);
    
    // Fetch all stories in parallel (but with concurrency limit)
    const stories: HNStory[] = [];
    for (const id of limitedIds) {
      try {
        const story = await this.getStory(id);
        if (story && !story.deleted && !story.dead) {
          stories.push(story);
        }
      } catch {
        // Skip failed stories
      }
    }
    
    return stories;
  }

  /**
   * Get new stories
   */
  async getNewStories(limit: number = 50): Promise<HNStory[]> {
    const response = await fetch(`${this.baseUrl}/newstories.json`);
    if (!response.ok) {
      throw new Error(`HN API error: ${response.status}`);
    }
    
    const storyIds: number[] = await response.json();
    const limitedIds = storyIds.slice(0, limit);
    
    const stories: HNStory[] = [];
    for (const id of limitedIds) {
      try {
        const story = await this.getStory(id);
        if (story && !story.deleted && !story.dead) {
          stories.push(story);
        }
      } catch {
        // Skip failed stories
      }
    }
    
    return stories;
  }

  /**
   * Get best stories (highest quality)
   */
  async getBestStories(limit: number = 50): Promise<HNStory[]> {
    const response = await fetch(`${this.baseUrl}/beststories.json`);
    if (!response.ok) {
      throw new Error(`HN API error: ${response.status}`);
    }
    
    const storyIds: number[] = await response.json();
    const limitedIds = storyIds.slice(0, limit);
    
    const stories: HNStory[] = [];
    for (const id of limitedIds) {
      try {
        const story = await this.getStory(id);
        if (story && !story.deleted && !story.dead) {
          stories.push(story);
        }
      } catch {
        // Skip failed stories
      }
    }
    
    return stories;
  }

  /**
   * Get a single story by ID
   */
  async getStory(id: number): Promise<HNStory | null> {
    const response = await fetch(`${this.baseUrl}/item/${id}.json`);
    if (!response.ok) {
      return null;
    }
    return response.json();
  }

  /**
   * Get an item (story or comment) by ID
   */
  async getItem(id: number): Promise<HNItem | null> {
    const response = await fetch(`${this.baseUrl}/item/${id}.json`);
    if (!response.ok) {
      return null;
    }
    return response.json();
  }

  /**
   * Check if a story is AI-related based on title
   */
  isAIRelated(story: HNStory): boolean {
    const searchText = `${story.title} ${story.text || ""}`.toLowerCase();
    return AI_KEYWORDS.some(keyword => searchText.includes(keyword));
  }

  /**
   * Filter stories to only AI-related ones
   */
  filterAIStories(stories: HNStory[]): HNStory[] {
    return stories.filter(story => this.isAIRelated(story));
  }

  /**
   * Get AI-related stories from top/new/best
   */
  async getAITopStories(limit: number = 50): Promise<HNStory[]> {
    // Try top stories first
    const topStories = await this.getTopStories(limit * 2);
    const aiStories = this.filterAIStories(topStories);
    
    if (aiStories.length >= limit) {
      return aiStories.slice(0, limit);
    }
    
    // If not enough, try new stories
    const newStories = await this.getNewStories(limit * 2);
    const newAIStories = this.filterAIStories(newStories);
    
    // Combine and dedupe
    const combined = [...aiStories];
    for (const story of newAIStories) {
      if (!combined.find(s => s.id === story.id)) {
        combined.push(story);
      }
      if (combined.length >= limit) break;
    }
    
    return combined.slice(0, limit);
  }
}

// Singleton instance
let hnClient: HackerNewsClient | null = null;

export function getHackerNewsClient(): HackerNewsClient {
  if (!hnClient) {
    hnClient = new HackerNewsClient();
  }
  return hnClient;
}
