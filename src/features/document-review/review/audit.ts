export type ReviewerAction = "edit" | "accept" | "reject";

export type AuditEvent = {
  action: ReviewerAction;
  timestamp: string;
  modelName: string;
  promptVersion: string;
  findingId: string;
};

export function createAuditEvent(
  action: ReviewerAction,
  findingId: string,
  modelName: string,
  promptVersion: string,
  timestamp = new Date().toISOString(),
): AuditEvent {
  return {
    action,
    timestamp,
    modelName,
    promptVersion,
    findingId,
  };
}
