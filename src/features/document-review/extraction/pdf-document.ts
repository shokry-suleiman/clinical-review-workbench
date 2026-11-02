import { DOMMatrix } from "@napi-rs/canvas";

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  if (typeof globalThis.DOMMatrix === "undefined") {
    Object.defineProperty(globalThis, "DOMMatrix", {
      configurable: true,
      value: DOMMatrix,
      writable: true,
    });
  }

  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}
