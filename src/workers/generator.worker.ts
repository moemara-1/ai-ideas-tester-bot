import { prisma } from "@/lib/prisma";
import { updateIdeaStatus } from "@/lib/ideas/service";
import { generateCodeForIdea, detectProjectType } from "@/lib/codegen/generator";
import { emitActivityLog } from "@/lib/instrumentation/activity-log";
import { createActivityLogEntry } from "@/lib/instrumentation/activity-log";
import { QueueNames } from "./queue-names";

export interface IdeaGenerationJob {
  ideaId: string;
  projectType?: "agent" | "api" | "script" | "webapp";
}

/**
 * Generate code for an idea
 */
export async function processIdeaGeneration(jobData: IdeaGenerationJob): Promise<{
  experimentId: string;
  filesCount: number;
}> {
  console.log("Starting code generation for idea:", jobData.ideaId);

  // Get the idea
  const idea = await prisma.idea.findUnique({
    where: { id: jobData.ideaId },
  });

  if (!idea) {
    throw new Error(`Idea not found: ${jobData.ideaId}`);
  }

  // Update status to generating
  await updateIdeaStatus(jobData.ideaId, "generating");

  // Detect or use specified project type
  const projectType = jobData.projectType || detectProjectType(idea.title);

  try {
    // Generate code using LLM
    const result = await generateCodeForIdea(
      idea.title,
      idea.description,
      projectType
    );

    // Create experiment record
    const experiment = await prisma.experiment.create({
      data: {
        ideaId: idea.id,
        status: "completed",
        promptUsed: `Generate ${result.projectType} for: ${idea.title}`,
        executionOutput: result.description,
      },
    });

    // Save generated files
    for (const file of result.files) {
      await prisma.generatedFile.create({
        data: {
          experimentId: experiment.id,
          path: file.path,
          content: file.content,
          language: file.language,
        },
      });
    }

    // Update idea status to completed
    await updateIdeaStatus(idea.id, "completed");

    emitActivityLog(
      createActivityLogEntry({
        event: "idea.generation.completed",
        level: "info",
        queue: QueueNames.IdeaGeneration,
        jobId: experiment.id,
        correlationId: idea.id,
        data: {
          ideaId: idea.id,
          experimentId: experiment.id,
          projectType: result.projectType,
          filesCount: result.files.length,
        },
      })
    );

    console.log(`Code generation complete. Created ${result.files.length} files.`);

    return {
      experimentId: experiment.id,
      filesCount: result.files.length,
    };
  } catch (error) {
    // Update idea status to failed
    await updateIdeaStatus(
      idea.id, 
      "failed", 
      error instanceof Error ? error.message : String(error)
    );

    emitActivityLog(
      createActivityLogEntry({
        event: "idea.generation.failed",
        level: "error",
        queue: QueueNames.IdeaGeneration,
        jobId: jobData.ideaId,
        correlationId: idea.id,
        data: {
          ideaId: idea.id,
          error: error instanceof Error ? error.message : String(error),
        },
      })
    );

    throw error;
  }
}
