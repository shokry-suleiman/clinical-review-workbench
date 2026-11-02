import { describe, expect, it } from "vitest";
import { extractPdfText } from "./pdf-document";
import { createReviewPdf } from "./pdf-report";
import type { ReviewFinding } from "./review-state";

describe("review PDF generation", () => {
  it("includes each review state and its supporting excerpt", async () => {
    const findings: ReviewFinding[] = [
      {
        id: "follow-up-1",
        field: "follow_up",
        value: "Schedule a follow-up visit in two weeks",
        sourceExcerpt: "Please schedule a follow-up visit in two weeks.",
        sourceSection: "Plan",
        status: "accepted",
        editedValue: "Schedule a follow-up visit in two weeks",
      },
      {
        id: "prep-1",
        field: "visit_preparation",
        value: "Bring the notes",
        sourceExcerpt: "Bring the notes to the next visit.",
        status: "draft",
        editedValue: "Bring the notes",
      },
    ];

    const bytes = await createReviewPdf("visit.pdf", findings);
    const reportText = await extractPdfText(bytes);

    expect(reportText).toContain("DRAFT REVIEW REPORT");
    expect(reportText).toContain("ACCEPTED");
    expect(reportText).toContain("DRAFT");
    expect(reportText).toContain("Please schedule a follow-up visit in two weeks.");
    expect(reportText).toContain("Bring the notes to the next visit.");
  });
});
