import {
  ServiceErrorSchema,
  ExtractedDocumentSchema,
  validateExtractionResponse,
  type ExtractedDocument,
} from "../contracts";

export type ExtractionService = (
  file: File,
  signal: AbortSignal,
) => Promise<ExtractedDocument>;

async function readJson(response: Response): Promise<unknown> {
  try {
    const body: unknown = await response.json();
    return body;
  } catch {
    throw new Error("The extraction service returned an unreadable response.");
  }
}

export async function extractFindings(
  file: File,
  signal: AbortSignal,
  endpoint = "/api/extract",
): Promise<ExtractedDocument> {
  const response = await fetch(endpoint, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/pdf",
      "X-Authorized-To-Send": "true",
    },
    body: file,
    signal,
  });
  const body = await readJson(response);

  if (!response.ok) {
    const serviceError = ServiceErrorSchema.safeParse(body);
    throw new Error(
      serviceError.success
        ? serviceError.data.error
        : `The extraction service request failed (${response.status}).`,
    );
  }

  const parsed = ExtractedDocumentSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(
      "The extraction service returned malformed data or unsupported source evidence. No findings were added.",
    );
  }

  const validatedResponse = validateExtractionResponse(
    {
      findings: parsed.data.findings,
      findingsSkipped: parsed.data.findingsSkipped,
    },
    parsed.data.sourceText,
  );
  if (!validatedResponse) {
    throw new Error(
      "The extraction service returned malformed data or unsupported source evidence. No findings were added.",
    );
  }

  return {
    ...parsed.data,
    findings: validatedResponse.findings,
    findingsSkipped: validatedResponse.findingsSkipped,
  };
}
