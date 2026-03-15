import { LeadLifecycleStates, type LeadLifecycleState } from "@/lib/domain/states";

export const LeadStatusLabels: Record<LeadLifecycleState, string> = {
  source_ingested: "Source Ingested",
  signal_scored: "Signal Scored",
  experiment_queued: "Experiment Queued",
  experiment_running: "Experiment Running",
  experiment_completed: "Experiment Completed",
  report_published: "Report Published",
  discovered: "Discovered",
  enriched: "Enriched",
  scored: "Scored",
  demo_generated: "Demo Generated",
  outreach_queued: "Outreach Queued",
  outreach_sent: "Outreach Sent",
  replied: "Replied",
  qualified: "Qualified",
  payment_pending: "Payment Pending",
  payment_completed: "Payment Completed",
  scheduled: "Scheduled",
  disqualified: "Disqualified",
};

export type PipelineStageSummary = {
  status: LeadLifecycleState;
  label: string;
  count: number;
};

export function buildPipelineStages(
  countsByStatus: Partial<Record<LeadLifecycleState, number>>
): PipelineStageSummary[] {
  return LeadLifecycleStates.map((status) => ({
    status,
    label: LeadStatusLabels[status],
    count: countsByStatus[status] ?? 0,
  }));
}

export function countPipelineTotal(stages: PipelineStageSummary[]): number {
  return stages.reduce((total, stage) => total + stage.count, 0);
}
