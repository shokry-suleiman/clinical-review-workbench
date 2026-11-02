import { NextResponse } from "next/server";
import { getMockExtractionResponse } from "@/features/document-review/mock-cases";
import {
  ScenarioSchema,
  UploadTextSchema,
  validateExtractionResponse,
} from "@/features/document-review/contracts";
import {
  extractWithGemini,
  GeminiExtractionError,
} from "@/features/document-review/gemini-extractor";

export const runtime = "nodejs";
const MAX_UPLOAD_BYTES = 50_000;

type TextBodyResult =
  | { success: true; text: string }
  | { success: false; reason: "too-large" | "invalid-encoding" };

async function readLimitedText(request: Request): Promise<TextBodyResult> {
  if (!request.body) return { success: true, text: "" };

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

  try {
    return {
      success: true,
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    };
  } catch {
    return { success: false, reason: "invalid-encoding" };
  }
}

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scenario = ScenarioSchema.safeParse(searchParams.get("scenario"));

  if (!scenario.success) {
    return NextResponse.json(
      { error: "Choose a supported mock response scenario." },
      { status: 400 },
    );
  }

  if (scenario.data === "service-failure") {
    return NextResponse.json(
      { error: "The mock extraction service is temporarily unavailable." },
      { status: 503 },
    );
  }

  return NextResponse.json(getMockExtractionResponse(scenario.data), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";")[0];
  if (contentType !== "text/plain") {
    return NextResponse.json(
      { error: "Upload synthetic text as text/plain." },
      { status: 415 },
    );
  }

  const body = await readLimitedText(request);
  if (!body.success) {
    const tooLarge = body.reason === "too-large";
    return NextResponse.json(
      {
        error: tooLarge
          ? "Synthetic text must be 50 KB or smaller."
          : "The uploaded text must be valid UTF-8.",
      },
      { status: tooLarge ? 413 : 400 },
    );
  }

  const parsedText = UploadTextSchema.safeParse(body.text);
  if (!parsedText.success) {
    return NextResponse.json(
      { error: "Upload a non-empty synthetic text document under 50 KB." },
      { status: 400 },
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
    const validatedResponse = validateExtractionResponse(
      response,
      parsedText.data,
    );

    if (!validatedResponse) {
      return NextResponse.json(
        {
          error:
            "Gemini returned unsupported source evidence. No findings were added.",
        },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(validatedResponse, {
      headers: {
        "Cache-Control": "no-store",
        "X-Demo-Extraction": "google-gemini",
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
