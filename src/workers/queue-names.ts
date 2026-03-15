export const QueueNames = {
  // New Idea Intelligence queues
  IdeaDiscovery: "idea.discovery",
  IdeaScoring: "idea.scoring",
  IdeaGeneration: "idea.code_generation",
  IdeaExecution: "idea.execution",
  
  // Legacy campaign queues (for backward compatibility)
  IdeaPipeline: "idea.pipeline",
  CampaignScout: "campaign.scout",
  LeadIntel: "lead.intel",
  LeadBuilder: "lead.builder",
  LeadOutreach: "lead.outreach",
  LeadCloser: "lead.closer",
  LeadScheduler: "lead.scheduler",
} as const;

export type QueueName = (typeof QueueNames)[keyof typeof QueueNames];

export const MainQueueNames = Object.values(QueueNames) as QueueName[];

export const DLQ_PREFIX = "dlq." as const;
export type DlqQueueName = `${typeof DLQ_PREFIX}${QueueName}`;

export function toDlqQueueName(queueName: QueueName): DlqQueueName {
  return `${DLQ_PREFIX}${queueName}` as DlqQueueName;
}
