import type { ExtractionFinding } from "./contracts";

const FOLLOW_UP_PATTERN =
  /(?:please\s+)?schedule a follow-up visit in \d{1,2}\s+(?:days?|weeks?|months?)(?:\.)?/i;
const PREPARATION_PATTERN =
  /bring [^\r\n.!?]{1,120} to the next visit(?:\.)?/i;

export function extractSyntheticFindings(
  documentText: string,
): ExtractionFinding[] {
  const findings: ExtractionFinding[] = [];
  const followUpExcerpt = FOLLOW_UP_PATTERN.exec(documentText)?.[0];
  if (followUpExcerpt) {
    const interval = /in \d{1,2}\s+(?:days?|weeks?|months?)/i.exec(
      followUpExcerpt,
    )?.[0];
    if (interval) {
      findings.push({
        id: "uploaded-follow-up",
        field: "follow_up",
        value: `Schedule a follow-up visit ${interval}`,
        sourceExcerpt: followUpExcerpt,
      });
    }
  }

  const preparationExcerpt = PREPARATION_PATTERN.exec(documentText)?.[0];
  if (preparationExcerpt) {
    findings.push({
      id: "uploaded-preparation",
      field: "visit_preparation",
      value: preparationExcerpt.replace(/[.]$/, ""),
      sourceExcerpt: preparationExcerpt,
    });
  }

  return findings;
}
