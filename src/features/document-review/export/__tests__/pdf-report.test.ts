import { describe, expect, it } from "vitest";
import { extractPdfText } from "../../extraction/pdf-document";
import { createReviewPdf } from "../pdf-report";
import type { ReviewFinding } from "../../review/review-state";

describe("review PDF generation", () => {
  it("includes accepted findings and source evidence, excluding other review states", async () => {
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
        value: "Draft-only instruction",
        sourceExcerpt: "Draft-only instruction.",
        status: "draft",
        editedValue: "Draft-only instruction",
      },
      {
        id: "allergy-1",
        field: "allergy_intolerance",
        value: "Rejected-only allergy",
        sourceExcerpt: "Rejected-only allergy.",
        status: "rejected",
        editedValue: "Rejected-only allergy",
      },
    ];

    const bytes = await createReviewPdf("visit.pdf", findings);
    const reportText = await extractPdfText(bytes);

    expect(reportText).toContain("Clinical Review Summary");
    expect(reportText).toContain("1 accepted finding");
    expect(reportText).toContain("FOLLOW-UP");
    expect(reportText).toContain("Please schedule a follow-up visit in two weeks.");
    expect(reportText).not.toContain("Draft-only instruction");
    expect(reportText).not.toContain("Rejected-only allergy");
    expect(reportText).not.toContain("DRAFT REVIEW REPORT");
    expect(reportText).toContain("Page 1 of 1");
  });

  it("reports when there are no accepted findings", async () => {
    const bytes = await createReviewPdf("visit.pdf", [
      {
        id: "follow-up-1",
        field: "follow_up",
        value: "Schedule a follow-up visit",
        sourceExcerpt: "Schedule a follow-up visit.",
        status: "draft",
        editedValue: "Schedule a follow-up visit",
      },
    ]);
    const reportText = await extractPdfText(bytes);

    expect(reportText).toContain("No findings were accepted for export.");
    expect(reportText).not.toContain("Schedule a follow-up visit.");
  });
});
