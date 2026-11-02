import { afterEach, describe, expect, it, vi } from "vitest";
import { extractFindings } from "../extraction-service";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extraction service response validation", () => {
  it("accepts extracted findings when the document text is included", async () => {
    const sourceText = "Follow-up plan: Schedule a visit in 3 weeks.";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            sourceText,
            submittedText: sourceText,
            findings: [
              {
                id: "1",
                field: "follow_up",
                value: "Schedule a visit in 3 weeks.",
                sourceExcerpt: "Schedule a visit in 3 weeks.",
                sourceSection: "Follow-up plan",
              },
            ],
            findingsSkipped: 0,
            modelName: "gemini-test",
            promptVersion: "test-v1",
            redactionCounts: {
              name: 0,
              date_of_birth: 0,
              mrn: 0,
              address: 0,
            },
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(
      extractFindings(
        new File(["%PDF-1.0"], "document.pdf", {
          type: "application/pdf",
        }),
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      sourceText,
      findings: [
        {
          sourceExcerpt: "Schedule a visit in 3 weeks.",
        },
      ],
    });
  });
});
