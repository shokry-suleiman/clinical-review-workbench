import type { ExtractionFinding } from "./contracts";

export type ReviewStatus = "draft" | "accepted" | "rejected";

export type ReviewFinding = ExtractionFinding & {
  status: ReviewStatus;
  editedValue: string;
};

export type ConfirmedFinding = Pick<
  ExtractionFinding,
  "id" | "field" | "sourceExcerpt"
> & {
  value: string;
};

export type ReviewAction =
  | { type: "load"; findings: ExtractionFinding[] }
  | { type: "edit"; id: string; value: string }
  | { type: "accept"; id: string }
  | { type: "reject"; id: string };

export function reviewReducer(
  state: ReviewFinding[],
  action: ReviewAction,
): ReviewFinding[] {
  if (action.type === "load") {
    return action.findings.map((finding) => ({
      ...finding,
      status: "draft",
      editedValue: finding.value,
    }));
  }

  return state.map((finding) => {
    if (finding.id !== action.id || finding.status !== "draft") {
      return finding;
    }

    if (action.type === "edit") {
      return { ...finding, editedValue: action.value };
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
            sourceExcerpt: finding.sourceExcerpt,
            value: finding.editedValue,
          },
        ]
      : [],
  );
}
