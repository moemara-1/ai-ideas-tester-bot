/**
 * OpenCode Generator Integration
 * 
 * OpenCode is an open-source CLI coding agent with MiniMax M2.5 Free
 * No API key required - uses OpenCode's proxy to MiniMax
 * 
 * Installation: curl -fsSL https://opencode.ai/install | bash
 * 
 * This module uses OpenCode as a subprocess to generate code.
 */

import { spawn } from "child_process";
import { writeFile, mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

export interface OpenCodeGenerationRequest {
  ideaTitle: string;
  ideaDescription: string | null;
  projectType: "agent" | "api" | "script" | "webapp";
}

export interface OpenCodeGeneratedFile {
  path: string;
  content: string;
  language: string;
}

export interface OpenCodeGenerationResult {
  files: OpenCodeGeneratedFile[];
  description: string;
  projectType: "agent" | "api" | "script" | "webapp";
}

/**
 * Check if OpenCode is installed
 */
export async function isOpenCodeInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("opencode", ["--version"], { shell: true });
    proc.on("close", (code) => {
      resolve(code === 0);
    });
    proc.on("error", () => {
      resolve(false);
    });
  });
}

/**
 * Generate code using OpenCode CLI
 * 
 * This creates a temporary project and uses OpenCode to generate code based on the idea.
 */
export async function generateCodeWithOpenCode(
  request: OpenCodeGenerationRequest
): Promise<OpenCodeGenerationResult> {
  const { ideaTitle, ideaDescription, projectType } = request;
  
  // Check if OpenCode is installed
  const installed = await isOpenCodeInstalled();
  if (!installed) {
    throw new Error(
      "OpenCode is not installed. Install with: curl -fsSL https://opencode.ai/install | bash"
    );
  }
  
  // Create a temporary directory for the project
  const tempDir = await mkdtemp(join(tmpdir(), "opencode-gen-"));
  
  try {
    // Create a prompt file
    const prompt = `Create a ${projectType} project that implements this idea:
    
Title: ${ideaTitle}
Description: ${ideaDescription || "No description provided"}

The project should be a working implementation with:
- Proper package.json with dependencies
- TypeScript/JavaScript source files
- README with setup instructions
- All necessary configuration files

Generate complete, working code.`;

    // Write the prompt to a file
    const promptFile = join(tempDir, "prompt.txt");
    await writeFile(promptFile, prompt);
    
    // Run OpenCode with the prompt
    const result = await runOpenCode(promptFile, tempDir);
    
    return result;
  } finally {
    // Clean up temp directory
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Run OpenCode CLI and get the generated code
 */
function runOpenCode(promptFile: string, workDir: string): Promise<OpenCodeGenerationResult> {
  return new Promise((resolve, reject) => {
    // Use OpenCode with --continue to continue any session
    // The prompt file contains our generation request
    const args = [
      "gen",           // Generate code
      "-p",           // Read prompt from file
      promptFile,
      "-o",           // Output directory
      workDir,
      "--model",      // Use MiniMax M2.5 Free
      "minimax/m2.5",
      "-y",           // Auto-approve
    ];
    
    console.log(`Running: opencode ${args.join(" ")}`);
    
    const proc = spawn("opencode", args, {
      cwd: workDir,
      shell: true,
      env: { ...process.env },
    });
    
    let stdout = "";
    let stderr = "";
    
    proc.stdout.on("data", (data) => {
      stdout += data.toString();
      console.log("[opencode]", data.toString().trim());
    });
    
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
      console.error("[opencode error]", data.toString().trim());
    });
    
    proc.on("close", (code) => {
      if (code === 0) {
        // Parse the generated files
        // For now, we'll return a basic result - in production you'd parse the output
        resolve({
          files: [],
          description: `Generated using OpenCode with MiniMax M2.5`,
          projectType: "agent",
        });
      } else {
        reject(new Error(`OpenCode exited with code ${code}: ${stderr}`));
      }
    });
    
    proc.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * Get the default project type for an idea based on keywords
 */
export function inferProjectType(title: string, description: string | null): "agent" | "api" | "script" | "webapp" {
  const text = `${title} ${description || ""}`.toLowerCase();
  
  // Agent keywords
  if (text.includes("agent") || text.includes("bot") || text.includes("autonomous") || text.includes("assistant")) {
    return "agent";
  }
  
  // API keywords
  if (text.includes("api") || text.includes("endpoint") || text.includes("service")) {
    return "api";
  }
  
  // Script keywords
  if (text.includes("script") || text.includes("automation") || text.includes("cron") || text.includes("batch")) {
    return "script";
  }
  
  // Webapp keywords
  if (text.includes("web") || text.includes("app") || text.includes("dashboard") || text.includes("ui") || text.includes("frontend")) {
    return "webapp";
  }
  
  // Default to script for simple ideas
  return "script";
}
