import { getServerEnv } from "@/lib/env/server-env";

interface GeneratedFile {
  path: string;
  content: string;
  language: string;
}

interface GenerationResult {
  files: GeneratedFile[];
  description: string;
  projectType: "agent" | "api" | "script" | "webapp";
}

const PROJECT_TEMPLATES = {
  agent: {
    name: "AI Agent",
    description: "A Node.js AI agent with TypeScript",
    files: [
      { path: "package.json", template: "agent_package.json" },
      { path: "tsconfig.json", template: "tsconfig.json" },
      { path: "src/index.ts", template: "agent_index.ts" },
      { path: "src/agent.ts", template: "agent.ts" },
      { path: "src/types.ts", template: "types.ts" },
      { path: ".env.example", template: "env.example" },
      { path: "README.md", template: "readme.md" },
    ],
  },
  api: {
    name: "REST API",
    description: "A Next.js API route",
    files: [
      { path: "package.json", template: "api_package.json" },
      { path: "tsconfig.json", template: "tsconfig.json" },
      { path: "app/api/agent/route.ts", template: "api_route.ts" },
      { path: "app/lib/agent.ts", template: "lib_agent.ts" },
      { path: "app/types.ts", template: "types.ts" },
      { path: ".env.example", template: "env.example" },
      { path: "README.md", template: "readme.md" },
    ],
  },
  script: {
    name: "Automation Script",
    description: "A Python automation script",
    files: [
      { path: "requirements.txt", template: "requirements.txt" },
      { path: "main.py", template: "script_main.py" },
      { path: "config.py", template: "config.py" },
      { path: "README.md", template: "readme.md" },
    ],
  },
  webapp: {
    name: "Web Application",
    description: "A Next.js web application",
    files: [
      { path: "package.json", template: "webapp_package.json" },
      { path: "tsconfig.json", template: "tsconfig.json" },
      { path: "next.config.js", template: "next.config.js" },
      { path: "app/page.tsx", template: "app_page.tsx" },
      { path: "app/layout.tsx", template: "app_layout.tsx" },
      { path: "app/globals.css", template: "app_globals.css" },
      { path: ".env.example", template: "env.example" },
      { path: "README.md", template: "readme.md" },
    ],
  },
};

/**
 * Get the model to use from the allowlist, with fallback
 */
function getModelFromAllowlist(allowlist: string[]): string {
  if (!allowlist || allowlist.length === 0) {
    // Fallback to a known free model if allowlist is empty
    return "google/gemini-2.0-flash-exp:free";
  }
  return allowlist[0];
}

/**
 * Get the referer URL for OpenRouter API calls
 */
function getOpenRouterReferer(): string {
  return process.env.APP_URL || "http://localhost:3000";
}

/**
 * Validate that required API keys are available
 */
function validateApiKeys(): void {
  const env = getServerEnv();
  if (!env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }
}

/**
 * Analyze an idea and determine what type of project to generate
 */
export async function analyzeProjectType(
  ideaTitle: string,
  ideaDescription: string | null
): Promise<"agent" | "api" | "script" | "webapp"> {
  const env = getServerEnv();
  
  // Use the allowlist of free models with fallback
  const model = getModelFromAllowlist(env.OPENROUTER_FREE_MODEL_ALLOWLIST);
  
  const prompt = `Analyze this idea and determine what type of project would best implement it.

Idea Title: ${ideaTitle}
Idea Description: ${ideaDescription || "No description"}

Respond with ONLY one word:
- "agent" if the idea is about an AI agent, bot, or autonomous system
- "api" if the idea is about an API service or endpoint
- "script" if the idea is about automation, data processing, or a simple script
- "webapp" if the idea is about a web application or website

Respond with just the word, nothing else.`;

  try {
    // Validate API keys before making request
    validateApiKeys();
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getServerEnv().OPENROUTER_API_KEY}`,
        "HTTP-Referer": getOpenRouterReferer(),
        "X-Title": "AI Idea Intelligence",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 10,
        temperature: 0.3,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error("Failed to analyze project type:", await response.text());
      return "agent"; // Default fallback
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content?.trim().toLowerCase();
    
    if (["agent", "api", "script", "webapp"].includes(result)) {
      return result as "agent" | "api" | "script" | "webapp";
    }
    
    return "agent"; // Default fallback
  } catch (error) {
    console.error("Error analyzing project type:", error);
    if (error instanceof Error && error.name === "AbortError") {
      console.error("Request timed out after 30 seconds");
    }
    return "agent"; // Default fallback
  }
}

/**
 * Generate code for an idea using LLM
 */
export async function generateCodeForIdea(
  ideaTitle: string,
  ideaDescription: string | null,
  projectType: "agent" | "api" | "script" | "webapp"
): Promise<GenerationResult> {
  const env = getServerEnv();
  const model = getModelFromAllowlist(env.OPENROUTER_FREE_MODEL_ALLOWLIST);

  const template = PROJECT_TEMPLATES[projectType];

  const prompt = `You are an expert software developer. Generate a complete, working project based on this idea.

## Idea
Title: ${ideaTitle}
Description: ${ideaDescription || "Implement the title as a functional project"}

## Project Type
${template.name} - ${template.description}

## Requirements
1. Generate ONLY the file contents, no explanations
2. Use modern best practices
3. Make the code actually work - include proper imports, error handling, etc.
4. Use the OpenRouter free models specified in the allowlist
5. Keep dependencies minimal

## File Structure
Generate these files:
${template.files.map((f) => `- ${f.path}`).join("\n")}

For each file, provide the complete file content. Format your response as:

FILE: <filename>
<file contents here>

END FILE

Start with the first file.`;

  try {
    // Validate API keys before making request
    validateApiKeys();
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getServerEnv().OPENROUTER_API_KEY}`,
        "HTTP-Referer": getOpenRouterReferer(),
        "X-Title": "AI Idea Intelligence",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 8000,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content generated");
    }

    // Parse the generated files
    const files = parseGeneratedFiles(content, projectType);

    return {
      files,
      description: `Generated ${template.name} project for: ${ideaTitle}`,
      projectType,
    };
  } catch (error) {
    console.error("Error generating code:", error);
    if (error instanceof Error && error.name === "AbortError") {
      console.error("Request timed out after 60 seconds");
      throw new Error("Code generation timed out after 60 seconds");
    }
    throw error;
  }
}

/**
 * Parse generated files from LLM response
 */
function parseGeneratedFiles(content: string, projectType: string): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const fileRegex = /FILE:\s*(.+?)\n([\s\S]*?)\nEND FILE/gi;
  
  let match;
  while ((match = fileRegex.exec(content)) !== null) {
    const path = match[1].trim();
    const fileContent = match[2].trim();
    
    // Determine language from file extension
    const language = getLanguageFromPath(path);
    
    files.push({
      path,
      content: fileContent,
      language,
    });
  }

  // If no files were parsed, try a simpler approach
  if (files.length === 0) {
    // Try to extract individual files from the content
    const lines = content.split("\n");
    let currentPath = "";
    let currentContent: string[] = [];
    let inFile = false;

    for (const line of lines) {
      if (line.startsWith("FILE:") || line.startsWith("```")) {
        // Save previous file if exists
        if (currentPath && currentContent.length > 0) {
          files.push({
            path: currentPath,
            content: currentContent.join("\n"),
            language: getLanguageFromPath(currentPath),
          });
        }
        // Start new file
        currentPath = line.replace(/^FILE:\s*|```/g, "").trim();
        currentContent = [];
        inFile = true;
      } else if (line === "```" || line === "END FILE") {
        if (currentPath && currentContent.length > 0) {
          files.push({
            path: currentPath,
            content: currentContent.join("\n"),
            language: getLanguageFromPath(currentPath),
          });
        }
        currentPath = "";
        currentContent = [];
        inFile = false;
      } else if (inFile) {
        currentContent.push(line);
      }
    }

    // Don't forget the last file
    if (currentPath && currentContent.length > 0) {
      files.push({
        path: currentPath,
        content: currentContent.join("\n"),
        language: getLanguageFromPath(currentPath),
      });
    }
  }

  return files;
}

/**
 * Get language from file path
 */
function getLanguageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  
  const languageMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    json: "json",
    md: "markdown",
    css: "css",
    html: "html",
    txt: "text",
    yml: "yaml",
    yaml: "yaml",
    toml: "toml",
  };

  return languageMap[ext || ""] || "text";
}

/**
 * Detect the project type from the idea
 */
export function detectProjectType(ideaTitle: string): "agent" | "api" | "script" | "webapp" {
  const title = ideaTitle.toLowerCase();
  
  // Simple heuristics
  if (title.includes("agent") || title.includes("bot") || title.includes("assistant")) {
    return "agent";
  }
  if (title.includes("api") || title.includes("endpoint") || title.includes("service")) {
    return "api";
  }
  if (title.includes("script") || title.includes("automation") || title.includes("scraper")) {
    return "script";
  }
  if (title.includes("app") || title.includes("website") || title.includes("web")) {
    return "webapp";
  }
  
  // Default to agent
  return "agent";
}
