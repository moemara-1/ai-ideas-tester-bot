import { spawn } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";

export interface ExecutionResult {
  step: string;
  output: string;
  exitCode: number | null;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  error?: string;
}

export interface ProjectFiles {
  files: Array<{ path: string; content: string }>;
  type: "node" | "python" | "nextjs";
}

/**
 * Validate that a file path stays within the work directory (prevents path traversal)
 */
function validateFilePath(workDir: string, filePath: string): void {
  const resolvedWorkDir = resolve(workDir);
  const resolvedPath = resolve(workDir, filePath);
  
  // Check if the resolved path starts with the work directory
  // Using sep to ensure proper path boundary checking
  if (!resolvedPath.startsWith(resolvedWorkDir + sep)) {
    throw new Error(`Path traversal attempt detected: ${filePath} resolves outside work directory`);
  }
}

/**
 * Execute generated code
 */
export async function executeCode(
  files: ProjectFiles,
  options: {
    timeout?: number;
    workDir?: string;
  } = {}
): Promise<ExecutionResult[]> {
  const { timeout = 60000, workDir = join("/tmp", "ai-idea-" + randomUUID()) } = options;
  const results: ExecutionResult[] = [];

  try {
    // Create working directory
    await mkdir(workDir, { recursive: true });

    // Write files to disk
    for (const file of files.files) {
      // Validate path to prevent path traversal attacks
      validateFilePath(workDir, file.path);
      
      const filePath = join(workDir, file.path);
      const dir = filePath.substring(0, filePath.lastIndexOf("/"));
      await mkdir(dir, { recursive: true });
      await writeFile(filePath, file.content);
    }

    // Detect project type and install/run
    if (files.type === "node") {
      results.push(await runNodeProject(workDir, timeout));
    } else if (files.type === "python") {
      results.push(await runPythonProject(workDir, timeout));
    } else if (files.type === "nextjs") {
      results.push(await runNextjsProject(workDir, timeout));
    }

    return results;
  } catch (error) {
    results.push({
      step: "execution",
      output: "",
      exitCode: 1,
      startedAt: new Date(),
      completedAt: new Date(),
      durationMs: 0,
      error: error instanceof Error ? error.message : String(error),
    });
    return results;
  }
}

/**
 * Run a Node.js project
 */
async function runNodeProject(workDir: string, timeout: number): Promise<ExecutionResult> {
  const startedAt = new Date();

  // Check if package.json exists
  const hasPackageJson = await fileExists(join(workDir, "package.json"));

  if (hasPackageJson) {
    // Install dependencies
    const installResult = await runCommand("npm", ["install"], {
      cwd: workDir,
      timeout,
    });
    
    if (installResult.exitCode !== 0) {
      return {
        step: "install",
        output: installResult.output,
        exitCode: installResult.exitCode,
        startedAt,
        completedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        error: "Failed to install dependencies",
      };
    }

    // Try to build
    const buildResult = await runCommand("npm", ["run", "build"], {
      cwd: workDir,
      timeout,
    });

    // Try to start or run
    let runResult;
    const hasStart = await fileExists(join(workDir, "package.json"));
    if (hasStart) {
      runResult = await runCommand("npm", ["start"], {
        cwd: workDir,
        timeout: Math.min(timeout, 10000), // Short run for testing
      });
    }

    return {
      step: "run",
      output: [installResult.output, buildResult?.output, runResult?.output].filter(Boolean).join("\n\n"),
      exitCode: runResult?.exitCode ?? 0,
      startedAt,
      completedAt: new Date(),
      durationMs: Date.now() - startedAt.getTime(),
    };
  }

  // No package.json, try to run the main file directly
  const mainFile = await findMainFile(workDir, ["index.js", "main.js", "app.js"]);
  
  if (mainFile) {
    return runCommand("node", [mainFile], {
      cwd: workDir,
      timeout,
    });
  }

  return {
    step: "run",
    output: "No package.json or main file found",
    exitCode: 1,
    startedAt,
    completedAt: new Date(),
    durationMs: Date.now() - startedAt.getTime(),
    error: "No runnable entry point found",
  };
}

/**
 * Run a Python project
 */
async function runPythonProject(workDir: string, timeout: number): Promise<ExecutionResult> {
  const startedAt = new Date();

  // Check for requirements.txt
  const hasRequirements = await fileExists(join(workDir, "requirements.txt"));

  if (hasRequirements) {
    const installResult = await runCommand("pip", ["install", "-r", "requirements.txt"], {
      cwd: workDir,
      timeout,
    });

    if (installResult.exitCode !== 0) {
      return {
        step: "install",
        output: installResult.output,
        exitCode: installResult.exitCode,
        startedAt,
        completedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        error: "Failed to install dependencies",
      };
    }
  }

  // Find and run main file
  const mainFile = await findMainFile(workDir, ["main.py", "app.py", "run.py", "index.py"]);

  if (mainFile) {
    return runCommand("python", [mainFile], {
      cwd: workDir,
      timeout,
    });
  }

  return {
    step: "run",
    output: "No Python main file found",
    exitCode: 1,
    startedAt,
    completedAt: new Date(),
    durationMs: Date.now() - startedAt.getTime(),
    error: "No runnable Python entry point found",
  };
}

/**
 * Run a Next.js project
 */
async function runNextjsProject(workDir: string, timeout: number): Promise<ExecutionResult> {
  const startedAt = new Date();

  // Install dependencies
  const installResult = await runCommand("npm", ["install"], {
    cwd: workDir,
    timeout,
  });

  if (installResult.exitCode !== 0) {
    return {
      step: "install",
      output: installResult.output,
      exitCode: installResult.exitCode,
      startedAt,
      completedAt: new Date(),
      durationMs: Date.now() - startedAt.getTime(),
      error: "Failed to install dependencies",
    };
  }

  // Build the project
  const buildResult = await runCommand("npm", ["run", "build"], {
    cwd: workDir,
    timeout,
  });

  return {
    step: "build",
    output: buildResult.output,
    exitCode: buildResult.exitCode,
    startedAt,
    completedAt: new Date(),
    durationMs: Date.now() - startedAt.getTime(),
  };
}

/**
 * Run a shell command
 */
async function runCommand(
  command: string,
  args: string[],
  options: {
    cwd: string;
    timeout: number;
  }
): Promise<ExecutionResult> {
  const startedAt = new Date();

  return new Promise((resolve) => {
    // Security: Filter environment variables to prevent credential exposure
    // Only pass PATH and FORCE_COLOR to executed code
    const safeEnv = {
      PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
      FORCE_COLOR: "0",
    };
    
    const proc = spawn(command, args as string[], {
      cwd: options.cwd,
      env: safeEnv as unknown as NodeJS.ProcessEnv,
    });

    let output = "";
    let errorOutput = "";

    proc.stdout?.on("data", (data) => {
      output += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      errorOutput += data.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      // Fallback to SIGKILL if process doesn't terminate within 5 seconds
      setTimeout(() => {
        if (!proc.killed) {
          proc.kill("SIGKILL");
        }
      }, 5000);
    }, options.timeout);

    proc.on("close", (code) => {
      clearTimeout(timeout);
      resolve({
        step: "run",
        output: output + (errorOutput ? "\n\nErrors:\n" + errorOutput : ""),
        exitCode: code,
        startedAt,
        completedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
      });
    });

    proc.on("error", (error) => {
      clearTimeout(timeout);
      resolve({
        step: "run",
        output: "",
        exitCode: 1,
        startedAt,
        completedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        error: error.message,
      });
    });
  });
}

/**
 * Check if a file exists
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    const { access } = await import("node:fs/promises");
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find main file in directory
 */
async function findMainFile(dir: string, candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    const path = join(dir, candidate);
    if (await fileExists(path)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Detect project type from files
 */
export function detectProjectType(files: Array<{ path: string }>): "node" | "python" | "nextjs" {
  const paths = files.map((f) => f.path);
  
  if (paths.some((p) => p.endsWith(".py"))) {
    return "python";
  }
  
  if (paths.some((p) => p.includes("package.json"))) {
    if (paths.some((p) => p.includes("next.config")) || paths.some((p) => p.startsWith("app/"))) {
      return "nextjs";
    }
    return "node";
  }
  
  return "node"; // Default
}
