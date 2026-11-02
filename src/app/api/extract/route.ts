import { NextResponse } from "next/server";
import {
  ExtractedDocumentSchema,
  UploadTextSchema,
  validateExtractionResponse,
} from "@/features/document-review/contracts";
import {
  extractWithGemini,
  GeminiExtractionError,
} from "@/features/document-review/gemini-extractor";
import { extractPdfText } from "@/features/document-review/pdf-document";

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

  try {
    const response = await extractWithGemini(parsedText.data, apiKey);
    const validatedResponse = validateExtractionResponse(response, parsedText.data);

    if (!validatedResponse) {
      return NextResponse.json(
        {
          error:
            "Gemini returned unsupported source evidence. No findings were added.",
        },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }

    const extractedDocument = ExtractedDocumentSchema.safeParse({
      sourceText: parsedText.data,
      findings: validatedResponse.findings,
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
        { error: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
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
