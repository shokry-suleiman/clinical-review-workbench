import type { ExtractionFinding, SuggestedCode } from "../contracts";
import { normalizeEvidence, normalizeEvidenceQuote } from "../contracts";

export type ReviewStatus = "draft" | "accepted" | "rejected";

export type FindingEvidence = {
  quote: string;
  section?: string;
};

export type ReviewFinding = ExtractionFinding & {
  evidence?: FindingEvidence[];
  status: ReviewStatus;
  editedValue: string;
};

export type ConfirmedFinding = Pick<
  ExtractionFinding,
  "id" | "field" | "sourceExcerpt"
> & {
  value: string;
  suggestedCode?: SuggestedCode;
};

export type ReviewAction =
  | { type: "load"; findings: ExtractionFinding[] }
  | { type: "edit"; id: string; value: string }
  | { type: "edit-code"; id: string; suggestedCode?: SuggestedCode }
  | { type: "accept"; id: string }
  | { type: "reject"; id: string };

export function reviewReducer(
  state: ReviewFinding[],
  action: ReviewAction,
): ReviewFinding[] {
  if (action.type === "load") {
    const findings = new Map<string, ReviewFinding>();

    for (const finding of action.findings) {
      const key = `${finding.field}:${normalizeEvidence(finding.name ?? "").toLowerCase()}:${normalizeEvidence(finding.value).toLowerCase()}`;
      const existing = findings.get(key);
      if (existing) {
        const evidence = existing.evidence ?? [
          {
            quote: normalizeEvidenceQuote(existing.sourceExcerpt),
            ...(existing.sourceSection ? { section: existing.sourceSection } : {}),
          },
        ];
        if (
          !evidence.some(
            (item) =>
              normalizeEvidence(item.quote) ===
                normalizeEvidence(finding.sourceExcerpt) &&
              normalizeEvidence(item.section ?? "") ===
                normalizeEvidence(finding.sourceSection ?? ""),
          )
        ) {
          findings.set(key, {
            ...existing,
            evidence: [
              ...evidence,
              {
                quote: normalizeEvidenceQuote(finding.sourceExcerpt),
                ...(finding.sourceSection
                  ? { section: finding.sourceSection }
                  : {}),
              },
            ],
          });
        }
        continue;
      }

      findings.set(key, {
        ...finding,
        evidence: [
          {
            quote: normalizeEvidenceQuote(finding.sourceExcerpt),
            ...(finding.sourceSection ? { section: finding.sourceSection } : {}),
          },
        ],
        status: "draft",
        editedValue: finding.value,
      });
    }

    return [...findings.values()];
  }

  return state.map((finding) => {
    if (finding.id !== action.id || finding.status !== "draft") {
      return finding;
    }

    if (action.type === "edit") {
      return { ...finding, editedValue: action.value };
    }

    if (action.type === "edit-code") {
      return { ...finding, suggestedCode: action.suggestedCode };
    }

    if (action.type === "accept" && finding.editedValue.trim().length > 0) {
      return { ...finding, status: "accepted" };
    }

    if (action.type === "reject") {
      return { ...finding, status: "rejected" };
    }

    return finding;
  });
}

export function getConfirmedFindings(
  findings: ReviewFinding[],
): ConfirmedFinding[] {
  return findings.flatMap((finding) =>
    finding.status === "accepted"
      ? [
          {
            id: finding.id,
            field: finding.field,
            sourceExcerpt: normalizeEvidenceQuote(finding.sourceExcerpt),
            value: finding.editedValue,
            ...(finding.suggestedCode
              ? { suggestedCode: finding.suggestedCode }
              : {}),
          },
        ]
      : [],
  );
}
