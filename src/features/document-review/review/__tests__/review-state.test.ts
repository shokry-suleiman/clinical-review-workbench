import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ExtractionResponseSchema,
  UploadTextSchema,
  validateExtractionResponse,
  type ExtractionFinding,
} from "../../contracts";
import {
  getConfirmedFindings,
  reviewReducer,
  type ReviewFinding,
} from "../review-state";
import {
  extractWithGemini,
  parseGeminiResponse,
} from "../../extraction/gemini-extractor";

const validFinding: ExtractionFinding = {
  id: "follow-up-01",
  field: "follow_up",
  value: "Follow up in 6 weeks",
  sourceExcerpt: "Please schedule a follow-up visit in 6 weeks.",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
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

  it("verifies source excerpts after whitespace normalization", () => {
    expect(
      validateExtractionResponse(
        {
          findings: [
            {
              ...validFinding,
              sourceExcerpt: "Please schedule a follow-up\n visit in 6 weeks.",
            },
          ],
        },
        "Please schedule a follow-up   visit in 6 weeks.",
      ),
    ).toBeDefined();
  });

  it("verifies words broken by a PDF line-end hyphen", () => {
    expect(
      validateExtractionResponse(
        {
          findings: [
            {
              ...validFinding,
              value: "Follow-up in 6 weeks",
              sourceExcerpt: "The patient should schedule a follow-up visit.",
            },
          ],
        },
        "The patient should schedule a follow-\nup visit.",
      ),
    ).toBeDefined();
  });

  it("does not require descriptive source-section metadata to be a quote", () => {
    const result = validateExtractionResponse(
      {
        findings: [
          {
            ...validFinding,
            sourceSection: "Follow-up plan",
          },
        ],
      },
      "The plan says: Please schedule a follow-up visit in 6 weeks.",
    );

    expect(result?.findings).toHaveLength(1);
    expect(result?.findings[0]?.sourceSection).toBe("Follow-up plan");
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

    expect(result).toMatchObject({ findings: [], findingsSkipped: 1 });
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
                            category: "follow_up",
                            value: sourceText,
                            evidence: sourceText,
                            section: "",
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
    expect(requestInit?.body).toContain('"maxOutputTokens":8192');
    expect(requestInit?.body).toContain('"thinkingLevel":"LOW"');
    expect(requestInit?.body).toContain('"evidence"');
    expect(requestInit?.body).not.toContain('"suggestedCode"');
  });

  it("converts provider rate limits to a retryable service error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 429 })),
    );

    await expect(
      extractWithGemini("Document text.", "test-server-api-key"),
    ).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining("quota"),
    });
  });

  it("uses the provider retry delay without logging provider response bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                message: "Too many requests.",
                details: [{ retryDelay: "12s" }],
              },
            }),
            { status: 429 },
          ),
      ),
    );

    await expect(
      extractWithGemini("Document text.", "test-server-api-key"),
    ).rejects.toMatchObject({
      status: 503,
      retryAfterSeconds: 12,
      message: expect.stringContaining("12 seconds"),
    });
  });

  it("distinguishes exhausted provider quota from temporary throttling", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                message: "Quota exceeded for metric requests per day.",
              },
            }),
            { status: 429 },
          ),
      ),
    );

    await expect(
      extractWithGemini("Document text.", "test-server-api-key"),
    ).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining("quota and billing configuration"),
    });
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
                        category: "follow_up",
                        value: "Schedule a follow-up visit in 3 weeks",
                        evidence: sourceText,
                        section: "",
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

  it("accepts a JSON code fence without relaxing response validation", () => {
    const sourceText = "Schedule a follow-up visit in 3 weeks.";
    const result = parseGeminiResponse(
      {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: `\uFEFF\`\`\`json\n${JSON.stringify({
                    findings: [
                      {
                        category: "follow_up",
                        value: sourceText,
                        evidence: sourceText,
                        section: "",
                      },
                    ],
                  })}\n\`\`\``,
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

  it("reports token-truncated output separately from malformed JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              candidates: [
                {
                  content: { parts: [{ text: '{"findings":[' }] },
                  finishReason: "MAX_TOKENS",
                },
              ],
            }),
            { status: 200 },
          ),
      ),
    );

    await expect(
      extractWithGemini("Document text.", "test-server-api-key"),
    ).rejects.toMatchObject({
      message: expect.stringContaining("stopped before completing"),
    });
  });

  it("accepts Gemini nulls for optional metadata without relaxing evidence checks", () => {
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
                        category: "follow_up",
                        value: "Schedule a follow-up visit in 3 weeks.",
                        evidence: sourceText,
                        section: "",
                        frequency: null,
                        status: "planned",
                      },
                    ],
                  }),
                },
              ],
            },
            finishReason: "STOP",
          },
        ],
      },
      sourceText,
    );

    expect(result?.findings).toHaveLength(1);
    expect(result?.findings[0]?.sourceSection).toBeUndefined();
    expect(result?.findings[0]?.frequency).toBeUndefined();
    expect(result?.findings[0]?.documentedStatus).toBe("planned");
  });

  it("keeps valid findings and counts malformed findings", () => {
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
                        category: "follow_up",
                        value: sourceText,
                        evidence: sourceText,
                        section: "",
                      },
                      {
                        category: "unknown",
                        value: "Malformed finding",
                        evidence: "Malformed finding",
                        section: "",
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
    expect(result?.findings[0]?.id).toBe("finding-1");
    expect(result?.findingsSkipped).toBe(1);
  });

  it("supports more than 25 findings without truncating the validated array", () => {
    const sourceText = "Fact 1. Fact 2. Fact 3.";
    const output = {
      findings: Array.from({ length: 30 }, (_, index) => ({
        category: "observation",
        value: `Fact ${index + 1}`,
        evidence: `Fact ${(index % 3) + 1}.`,
        section: "",
      })),
    };
    const result = parseGeminiResponse(
      {
        candidates: [
          {
            content: { parts: [{ text: JSON.stringify(output) }] },
            finishReason: "STOP",
          },
        ],
      },
      sourceText,
    );

    expect(result?.findings).toHaveLength(30);
    expect(result?.findingsSkipped).toBe(0);
  });

  it.each([
    {
      name: "empty response",
      response: { candidates: [{ content: { parts: [] } }] },
      code: "GEMINI_EMPTY_RESPONSE",
    },
    {
      name: "blocked response",
      response: {
        promptFeedback: { blockReason: "SAFETY" },
        candidates: [],
      },
      code: "GEMINI_BLOCKED_RESPONSE",
    },
    {
      name: "invalid generated JSON",
      response: {
        candidates: [{ content: { parts: [{ text: "not json" }] } }],
      },
      code: "GEMINI_JSON_PARSE_ERROR",
    },
    {
      name: "invalid response schema",
      response: {
        candidates: [{ content: { parts: [{ text: "{}" }] } }],
      },
      code: "GEMINI_SCHEMA_VALIDATION_ERROR",
    },
  ])("returns an internal code for $name", async ({ response, code }) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(response), { status: 200 })),
    );

    await expect(
      extractWithGemini("Document text.", "test-server-api-key"),
    ).rejects.toMatchObject({ code });
  });

  it("logs only safe diagnostics in development and suppresses them in production", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        findings: [
                          {
                            category: "invalid-sensitive-value",
                            value: "MODEL_OUTPUT_SECRET",
                          },
                        ],
                      }),
                    },
                  ],
                },
                finishReason: "STOP",
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(
      extractWithGemini("PRIVATE DOCUMENT TEXT", "test-server-api-key"),
    ).resolves.toMatchObject({ findingsSkipped: 1 });
    expect(warning).toHaveBeenCalledWith(
      "[Gemini extraction diagnostic]",
      expect.objectContaining({
        finishReason: "STOP",
        responseLength: expect.any(Number),
        zodIssuePaths: expect.arrayContaining(["findings.0.category"]),
      }),
    );
    expect(JSON.stringify(warning.mock.calls)).not.toContain(
      "PRIVATE DOCUMENT TEXT",
    );
    expect(JSON.stringify(warning.mock.calls)).not.toContain(
      "MODEL_OUTPUT_SECRET",
    );

    warning.mockClear();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: "MODEL_OUTPUT_SECRET {" }],
                },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    await expect(
      extractWithGemini("PRIVATE DOCUMENT TEXT", "test-server-api-key"),
    ).rejects.toMatchObject({ code: "GEMINI_JSON_PARSE_ERROR" });
    expect(warning).not.toHaveBeenCalled();
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
                          category: "follow_up",
                          value: "Follow up in 4 weeks",
                          evidence: "Follow up in 4 weeks.",
                          section: "",
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
    ).toMatchObject({ findings: [], findingsSkipped: 1 });
  });

  it("returns valid findings and reports evidence failures as skipped", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify({
                          findings: [
                            {
                              category: "follow_up",
                              value: "Unsupported content",
                              evidence: "Unsupported quote.",
                              section: "",
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
          ),
      ),
    );

    await expect(
      extractWithGemini("Schedule a follow-up visit.", "test-server-api-key"),
    ).resolves.toMatchObject({
      findings: [],
      findingsSkipped: 1,
    });
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

  it("keeps edited code suggestions marked draft until the finding is accepted", () => {
    const codedFinding: ExtractionFinding = {
      ...validFinding,
      id: "observation-1",
      field: "observation",
      suggestedCode: { system: "LOINC", code: "1234-5" },
    };
    const loaded = reviewReducer([], {
      type: "load",
      findings: [codedFinding],
    });
    const edited = reviewReducer(loaded, {
      type: "edit-code",
      id: codedFinding.id,
      suggestedCode: { system: "LOINC", code: "6789-0" },
    });

    expect(edited[0]?.status).toBe("draft");
    expect(edited[0]?.suggestedCode?.code).toBe("6789-0");
    expect(getConfirmedFindings(edited)).toEqual([]);

    const accepted = reviewReducer(edited, {
      type: "accept",
      id: codedFinding.id,
    });
    expect(getConfirmedFindings(accepted)[0]?.suggestedCode).toEqual({
      system: "LOINC",
      code: "6789-0",
    });
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
