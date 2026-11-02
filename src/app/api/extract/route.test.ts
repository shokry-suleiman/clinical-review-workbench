import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { POST } from "./route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/extract de-identification boundary", () => {
  it("returns a distinct internal error code for truncated Gemini output", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText("Follow-up in 6 weeks.", {
      x: 48,
      y: 760,
      font,
      size: 12,
    });

    vi.stubEnv("GEMINI_API_KEY", "server-only-test-key");
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
                        text: '{"findings":[',
                      },
                    ],
                  },
                  finishReason: "MAX_TOKENS",
                },
              ],
            }),
            { status: 200 },
          ),
      ),
    );

    const request = new Request("http://localhost/api/extract", {
      method: "POST",
      headers: {
        "Content-Type": "application/pdf",
        "X-Authorized-To-Send": "true",
      },
      body: new Uint8Array(await pdf.save()),
    });
    const response = await POST(request);
    const body: unknown = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      code: "GEMINI_TRUNCATED_RESPONSE",
    });
  });

  it("sends redacted text to Gemini and returns locally restored evidence", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    [
      "Patient name: Anna Example",
      "DOB: 01/02/1980",
      "MRN: TEST-1001",
      "Address: 4 Example Street",
      "Follow-up in 6 weeks.",
    ].forEach((line, index) => {
      page.drawText(line, { x: 48, y: 760 - index * 24, font, size: 12 });
    });

    vi.stubEnv("GEMINI_API_KEY", "server-only-test-key");
    let providerRequestBody = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        providerRequestBody = String(init?.body);
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
                            value: "Follow-up in 6 weeks.",
                            evidence: "Follow-up in 6 weeks.",
                            section: "",
                          },
                          {
                            category: "unsupported",
                            value: "Invalid finding",
                            evidence: "Invalid finding",
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
      }),
    );

    const request = new Request("http://localhost/api/extract", {
      method: "POST",
      headers: {
        "Content-Type": "application/pdf",
        "X-Authorized-To-Send": "true",
      },
      body: new Uint8Array(await pdf.save()),
    });
    const response = await POST(request);
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(providerRequestBody).not.toContain("Anna Example");
    expect(providerRequestBody).not.toContain("01/02/1980");
    expect(providerRequestBody).not.toContain("TEST-1001");
    expect(providerRequestBody).not.toContain("4 Example Street");
    expect(providerRequestBody).toContain("[REDACTED_NAME_1]");
    expect(providerRequestBody).toContain("[REDACTED_DATE_OF_BIRTH_1]");
    expect(providerRequestBody).toContain("[REDACTED_MRN_1]");
    expect(providerRequestBody).toContain("[REDACTED_ADDRESS_1]");
    expect(body).toMatchObject({
      findings: [
        {
          id: "finding-1",
          sourceExcerpt: "Follow-up in 6 weeks.",
        },
      ],
      findingsSkipped: 1,
      redactionCounts: {
        name: 1,
        date_of_birth: 1,
        mrn: 1,
        address: 1,
      },
    });
  });
});
