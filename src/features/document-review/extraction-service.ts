import {
  ServiceErrorSchema,
  validateExtractionResponse,
  type ExtractionResponse,
  type Scenario,
} from "./contracts";
import { SYNTHETIC_SOURCE_DOCUMENT } from "./source-document";

export type ExtractionService = (
  scenario: Scenario,
  signal: AbortSignal,
  documentText?: string,
) => Promise<ExtractionResponse>;

async function readJson(response: Response): Promise<unknown> {
  try {
    const body: unknown = await response.json();
    return body;
  } catch {
    throw new Error("The extraction service returned an unreadable response.");
  }
}

export async function extractFindings(
  scenario: Scenario,
  signal: AbortSignal,
  documentText?: string,
  endpoint = "/api/extract",
): Promise<ExtractionResponse> {
  const response =
    documentText === undefined
      ? await fetch(
          `${endpoint}?scenario=${encodeURIComponent(scenario)}`,
          {
            method: "GET",
            cache: "no-store",
            signal,
          },
        )
      : await fetch(endpoint, {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "text/plain; charset=utf-8" },
          body: documentText,
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

  const parsed = validateExtractionResponse(
    body,
    documentText ?? SYNTHETIC_SOURCE_DOCUMENT.text,
  );
  if (!parsed) {
    throw new Error(
      "The extraction service returned malformed data or unsupported source evidence. No findings were added.",
    );
  }

  return parsed;
}
