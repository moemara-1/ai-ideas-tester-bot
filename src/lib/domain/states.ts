export const LeadLifecycleStates = [
  "source_ingested",
  "signal_scored",
  "experiment_queued",
  "experiment_running",
  "experiment_completed",
  "report_published",
  "discovered",
  "enriched",
  "scored",
  "demo_generated",
  "outreach_queued",
  "outreach_sent",
  "replied",
  "qualified",
  "payment_pending",
  "payment_completed",
  "scheduled",
  "disqualified",
] as const;

export type LeadLifecycleState = (typeof LeadLifecycleStates)[number];

const LeadLifecycleTransitionMap: Record<LeadLifecycleState, readonly LeadLifecycleState[]> = {
  source_ingested: ["signal_scored", "disqualified"],
  signal_scored: [
    "experiment_queued",
    "experiment_running",
    "experiment_completed",
    "report_published",
    "disqualified",
  ],
  experiment_queued: ["experiment_running", "disqualified"],
  experiment_running: ["experiment_completed", "disqualified"],
  experiment_completed: ["report_published", "experiment_queued", "disqualified"],
  report_published: ["experiment_queued", "disqualified"],
  discovered: ["enriched", "disqualified"],
  enriched: ["scored", "disqualified"],
  scored: ["demo_generated", "outreach_queued", "disqualified"],
  demo_generated: ["outreach_queued", "disqualified"],
  outreach_queued: ["outreach_sent", "disqualified"],
  outreach_sent: ["replied", "payment_pending", "disqualified"],
  replied: ["qualified", "payment_pending", "disqualified"],
  qualified: ["payment_pending", "scheduled", "disqualified"],
  payment_pending: ["payment_completed", "scheduled", "disqualified"],
  payment_completed: ["scheduled"],
  scheduled: [],
  disqualified: [],
};

export function isLeadLifecycleState(value: string): value is LeadLifecycleState {
  return LeadLifecycleStates.includes(value as LeadLifecycleState);
}

export function canTransitionLeadLifecycleState(
  from: LeadLifecycleState,
  to: LeadLifecycleState
): boolean {
  return LeadLifecycleTransitionMap[from].includes(to);
}

export const AgentRunStates = ["started", "completed", "failed"] as const;

export type AgentRunState = (typeof AgentRunStates)[number];

export function isAgentRunState(value: string): value is AgentRunState {
  return AgentRunStates.includes(value as AgentRunState);
}

export function isTerminalAgentRunState(state: AgentRunState): boolean {
  return state === "completed" || state === "failed";
}
