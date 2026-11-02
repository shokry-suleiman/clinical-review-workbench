import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ExtractionResponseSchema,
  UploadTextSchema,
  validateExtractionResponse,
  type ExtractionFinding,
} from "./contracts";
import {
  getConfirmedFindings,
  reviewReducer,
  type ReviewFinding,
} from "./review-state";
import {
  extractWithGemini,
  parseGeminiResponse,
} from "./gemini-extractor";

const validFinding: ExtractionFinding = {
  id: "follow-up-01",
  field: "follow_up",
  value: "Follow up in 6 weeks",
  sourceExcerpt: "Please schedule a follow-up visit in 6 weeks.",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extraction response validation", () => {
  it("accepts a valid response and an omitted optional source section", () => {
    const result = ExtractionResponseSchema.safeParse({
      findings: [validFinding],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.findings[0]?.sourceSection).toBeUndefined();
    }
  });

  it("rejects malformed or incomplete findings", () => {
    const result = ExtractionResponseSchema.safeParse({
      findings: [
        {
          id: "broken",
          field: "follow_up",
          value: 6,
          sourceExcerpt: null,
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects evidence that is not present in the source document", () => {
    const result = validateExtractionResponse({
      findings: [
        {
          ...validFinding,
          sourceExcerpt: "An unsupported instruction.",
        },
      ],
    }, "Document with no supporting instruction.");

    expect(result).toBeUndefined();
  });

  it("accepts only non-empty text within the upload size limit", () => {
    expect(UploadTextSchema.safeParse("Document content").success).toBe(
      true,
    );
    expect(UploadTextSchema.safeParse(" \n ").success).toBe(false);
    expect(UploadTextSchema.safeParse("x".repeat(50_001)).success).toBe(false);
  });
});

describe("Gemini response validation", () => {
  it("sends uploaded text to Gemini using the server-side API key", async () => {
    const sourceText = "Schedule a follow-up visit in 3 weeks.";
    let requestedUrl: RequestInfo | URL | undefined;
    let requestInit: RequestInit | undefined;
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        requestedUrl = input;
        requestInit = init;
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        findings: [
                          {
                            id: "finding-1",
                            field: "follow_up",
                            value: sourceText,
                            sourceExcerpt: sourceText,
                          },
                        ],
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await extractWithGemini(sourceText, "test-server-api-key");

    expect(result.findings).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(requestedUrl)).toContain(
      "models/gemini-3.6-flash:generateContent",
    );
    expect(new Headers(requestInit?.headers).get("x-goog-api-key")).toBe(
      "test-server-api-key",
    );
    expect(requestInit?.body).toContain(sourceText);
  });

  it("converts provider rate limits to a retryable service error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 429 })),
    );

    await expect(
      extractWithGemini("Document text.", "test-server-api-key"),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("accepts exact source evidence from a structured Gemini response", () => {
    const sourceText = "Schedule a follow-up visit in 3 weeks.";
    const result = parseGeminiResponse(
      {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    findings: [
                      {
                        id: "finding-1",
                        field: "follow_up",
                        value: "Schedule a follow-up visit in 3 weeks",
                        sourceExcerpt: sourceText,
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      },
      sourceText,
    );

    expect(result?.findings).toHaveLength(1);
  });

  it("rejects malformed output and excerpts not present in the source", () => {
    expect(
      parseGeminiResponse(
        { candidates: [{ content: { parts: [{ text: "not json" }] } }] },
        "Source document.",
      ),
    ).toBeUndefined();

    expect(
      parseGeminiResponse(
        {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      findings: [
                        {
                          id: "finding-1",
                          field: "follow_up",
                          value: "Follow up in 4 weeks",
                          sourceExcerpt: "Follow up in 4 weeks.",
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        },
        "No follow-up instruction appears here.",
      ),
    ).toBeUndefined();
  });
});

describe("review state transitions", () => {
  it("keeps edits in draft until explicitly accepted", () => {
    const loaded = reviewReducer([], {
      type: "load",
      findings: [validFinding],
    });
    const edited = reviewReducer(loaded, {
      type: "edit",
      id: validFinding.id,
      value: "Follow up in about 6 weeks",
    });

    expect(edited[0]?.status).toBe("draft");
    expect(getConfirmedFindings(edited)).toEqual([]);

    const accepted = reviewReducer(edited, {
      type: "accept",
      id: validFinding.id,
    });

    expect(accepted[0]?.status).toBe("accepted");
    expect(getConfirmedFindings(accepted)).toEqual([
      {
        id: validFinding.id,
        field: validFinding.field,
        sourceExcerpt: validFinding.sourceExcerpt,
        value: "Follow up in about 6 weeks",
      },
    ]);
  });

  it("keeps rejected findings out of confirmed information", () => {
    const loaded = reviewReducer([], {
      type: "load",
      findings: [validFinding],
    });
    const rejected = reviewReducer(loaded, {
      type: "reject",
      id: validFinding.id,
    });

    expect(rejected[0]?.status).toBe("rejected");
    expect(getConfirmedFindings(rejected)).toEqual([]);
  });

  it("does not allow editing or accepting a reviewed item", () => {
    const accepted: ReviewFinding[] = reviewReducer([], {
      type: "load",
      findings: [validFinding],
    }).map((finding) => ({ ...finding, status: "accepted" }));
    const attemptedEdit = reviewReducer(accepted, {
      type: "edit",
      id: validFinding.id,
      value: "Changed after review",
    });
    const attemptedReject = reviewReducer(attemptedEdit, {
      type: "reject",
      id: validFinding.id,
    });

    expect(attemptedReject).toEqual(accepted);
    expect(getConfirmedFindings(attemptedReject)[0]?.value).toBe(
      validFinding.value,
    );
  });

  it("does not accept an empty edited value", () => {
    const loaded = reviewReducer([], {
      type: "load",
      findings: [validFinding],
    });
    const edited = reviewReducer(loaded, {
      type: "edit",
      id: validFinding.id,
      value: "  ",
    });
    const attemptedAccept = reviewReducer(edited, {
      type: "accept",
      id: validFinding.id,
    });

    expect(attemptedAccept[0]?.status).toBe("draft");
    expect(getConfirmedFindings(attemptedAccept)).toEqual([]);
  });
});
