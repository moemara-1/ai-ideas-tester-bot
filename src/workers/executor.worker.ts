import { prisma } from "@/lib/prisma";
import { updateIdeaStatus } from "@/lib/ideas/service";
import { executeCode, detectProjectType } from "@/lib/executor/runner";
import { emitActivityLog } from "@/lib/instrumentation/activity-log";
import { createActivityLogEntry } from "@/lib/instrumentation/activity-log";
import { QueueNames } from "./queue-names";

export interface IdeaExecutionJob {
  experimentId: string;
}

/**
 * Execute generated code
 */
export async function processIdeaExecution(jobData: IdeaExecutionJob): Promise<{
  executionResults: Array<{
    step: string;
    exitCode: number | null;
    durationMs: number;
  }>;
}> {
  console.log("Starting code execution for experiment:", jobData.experimentId);

  // Get the experiment
  const experiment = await prisma.experiment.findUnique({
    where: { id: jobData.experimentId },
    include: {
      idea: true,
      files: true,
    },
  });

  if (!experiment) {
    throw new Error(`Experiment not found: ${jobData.experimentId}`);
  }

  // Update idea status to executing (not generating, as this is the execution phase)
  await updateIdeaStatus(experiment.ideaId, "generating");

  try {
    // Prepare files for execution
    const files = experiment.files.map((f) => ({
      path: f.path,
      content: f.content,
    }));

    // Detect project type
    const projectType = detectProjectType(files);

    // Execute code
    const results = await executeCode(
      {
        files,
        type: projectType,
      },
      {
        timeout: 120000, // 2 minute timeout
      }
    );

    // Save execution results
    for (const result of results) {
      await prisma.executionResult.create({
        data: {
          experimentId: experiment.id,
          step: result.step,
          output: result.output,
          exitCode: result.exitCode ?? undefined,
          startedAt: result.startedAt,
          completedAt: result.completedAt,
          durationMs: result.durationMs,
        },
      });
    }

    // Update experiment with execution info
    await prisma.experiment.update({
      where: { id: experiment.id },
      data: {
        status: results.some((r) => r.exitCode === 0) ? "completed" : "failed",
        executionTimeMs: results.reduce((sum, r) => sum + r.durationMs, 0),
        executionOutput: results.map((r) => r.output).join("\n\n"),
        exitCode: results[results.length - 1]?.exitCode ?? undefined,
      },
    });

    // Update idea status
    await updateIdeaStatus(experiment.ideaId, "completed");

    emitActivityLog(
      createActivityLogEntry({
        event: "idea.execution.completed",
        level: results.some((r) => r.exitCode === 0) ? "info" : "warn",
        queue: QueueNames.IdeaExecution,
        jobId: experiment.id,
        correlationId: experiment.ideaId,
        data: {
          experimentId: experiment.id,
          ideaId: experiment.ideaId,
          stepsRun: results.length,
          success: results.some((r) => r.exitCode === 0),
        },
      })
    );

    console.log(`Execution complete. Ran ${results.length} steps.`);

    return {
      executionResults: results.map((r) => ({
        step: r.step,
        exitCode: r.exitCode,
        durationMs: r.durationMs,
      })),
    };
  } catch (error) {
    // Update experiment and idea as failed
    await prisma.experiment.update({
      where: { id: experiment.id },
      data: {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });

    await updateIdeaStatus(
      experiment.ideaId,
      "failed",
      error instanceof Error ? error.message : String(error)
    );

    emitActivityLog(
      createActivityLogEntry({
        event: "idea.execution.failed",
        level: "error",
        queue: QueueNames.IdeaExecution,
        jobId: experiment.id,
        correlationId: experiment.ideaId,
        data: {
          experimentId: experiment.id,
          ideaId: experiment.ideaId,
          error: error instanceof Error ? error.message : String(error),
        },
      })
    );

    throw error;
  }
}
