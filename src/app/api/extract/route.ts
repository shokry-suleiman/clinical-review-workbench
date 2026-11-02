import { NextResponse } from "next/server";
import {
  ExtractedDocumentSchema,
  UploadTextSchema,
  validateExtractionResponse,
} from "@/features/document-review/contracts";
import {
  GeminiExtractionProvider,
  GeminiExtractionError,
} from "@/features/document-review/extraction/gemini-extractor";
import type { ExtractionProvider } from "@/features/document-review/extraction/extraction-provider";
import { deidentifyDocument } from "@/features/document-review/extraction/deidentification";
import { extractPdfText } from "@/features/document-review/extraction/pdf-document";

export const runtime = "nodejs";
const MAX_UPLOAD_BYTES = 10_000_000;

type PdfBodyResult =
  | { success: true; bytes: Uint8Array }
  | { success: false; reason: "too-large" };

async function readLimitedPdf(request: Request): Promise<PdfBodyResult> {
  if (!request.body) return { success: true, bytes: new Uint8Array() };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.byteLength;
    if (totalBytes > MAX_UPLOAD_BYTES) {
      await reader.cancel();
      return { success: false, reason: "too-large" };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { success: true, bytes };
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";")[0];
  if (contentType !== "application/pdf") {
    return NextResponse.json(
      { error: "Upload a PDF document." },
      { status: 415 },
    );
  }

  if (request.headers.get("x-authorized-to-send") !== "true") {
    return NextResponse.json(
      { error: "Confirm authorization before sending the PDF to Gemini." },
      { status: 400 },
    );
  }

  const body = await readLimitedPdf(request);
  if (!body.success) {
    return NextResponse.json(
      { error: "PDF files must be 10 MB or smaller." },
      { status: 413 },
    );
  }

  const isPdf = body.bytes.byteLength >= 5 &&
    new TextDecoder().decode(body.bytes.subarray(0, 5)) === "%PDF-";
  if (!isPdf) {
    return NextResponse.json(
      { error: "The uploaded file is not a valid PDF." },
      { status: 400 },
    );
  }

  let extractedText: string;
  try {
    extractedText = await extractPdfText(body.bytes);
  } catch (error: unknown) {
    const parser = error instanceof Error ? error.name : "unknown";
    return NextResponse.json(
      {
        error:
          parser === "PasswordException"
            ? "This PDF is password-protected. Remove its password and try again."
            : parser === "InvalidPDFException" || parser === "FormatError"
              ? "This PDF is damaged or uses an unsupported format. Re-save it as a standard PDF and retry."
              : `The PDF parser could not read this file (${parser}). Try re-saving it as a standard PDF and retry.`,
      },
      { status: 422 },
    );
  }

  const parsedText = UploadTextSchema.safeParse(extractedText);
  if (!parsedText.success) {
    return NextResponse.json(
      {
        error:
          "The PDF contains no extractable text or exceeds the 50,000-character limit. Scanned PDFs require OCR and are not supported.",
      },
      { status: 422 },
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Gemini is not configured. Add GEMINI_API_KEY to .env.local." },
      { status: 503 },
    );
  }

  const deidentified = deidentifyDocument(parsedText.data);
  const submittedText = UploadTextSchema.safeParse(deidentified.text);
  if (!submittedText.success) {
    return NextResponse.json(
      { error: "The de-identified document exceeds supported text limits." },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const provider: ExtractionProvider = new GeminiExtractionProvider(apiKey);
    const response = await provider.extract(submittedText.data);
    const validatedResponse = validateExtractionResponse(
      response,
      submittedText.data,
    );

    if (!validatedResponse) {
      return NextResponse.json(
        {
          error:
            "Gemini returned a response that did not match the required schema. No findings were added.",
          code: "GEMINI_SCHEMA_VALIDATION_ERROR",
        },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }

    const restoredFindings = validatedResponse.findings.map((finding, index) => ({
      ...finding,
      id: `finding-${index + 1}`,
      value: deidentified.restore(finding.value),
      ...(finding.name ? { name: deidentified.restore(finding.name) } : {}),
      sourceExcerpt: deidentified.restore(finding.sourceExcerpt),
      ...(finding.sourceSection
        ? { sourceSection: deidentified.restore(finding.sourceSection) }
        : {}),
      ...(finding.dose ? { dose: deidentified.restore(finding.dose) } : {}),
      ...(finding.frequency
        ? { frequency: deidentified.restore(finding.frequency) }
        : {}),
      ...(finding.documentedStatus
        ? { documentedStatus: deidentified.restore(finding.documentedStatus) }
        : {}),
      ...(finding.unit ? { unit: deidentified.restore(finding.unit) } : {}),
      ...(finding.flag ? { flag: deidentified.restore(finding.flag) } : {}),
    }));
    const extractedDocument = ExtractedDocumentSchema.safeParse({
      sourceText: parsedText.data,
      submittedText: submittedText.data,
      findings: restoredFindings,
      findingsSkipped: validatedResponse.findingsSkipped,
      modelName: provider.metadata.modelName,
      promptVersion: provider.metadata.promptVersion,
      redactionCounts: deidentified.redactionCounts,
    });
    if (!extractedDocument.success) {
      return NextResponse.json(
        { error: "The extracted document exceeded supported limits." },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(extractedDocument.data, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    if (error instanceof GeminiExtractionError) {
      return NextResponse.json(
        {
          error: error.message,
          ...(error.code ? { code: error.code } : {}),
        },
        {
          status: error.status,
          headers: {
            "Cache-Control": "no-store",
            ...(error.retryAfterSeconds
              ? { "Retry-After": String(error.retryAfterSeconds) }
              : {}),
          },
        },
      );
    }

    return NextResponse.json(
      {
        error:
          "Gemini could not be reached. Check the connection and retry; no findings were added.",
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
