import { DOMMatrix } from "@napi-rs/canvas";

if (typeof globalThis.DOMMatrix === "undefined") {
  Object.defineProperty(globalThis, "DOMMatrix", {
    configurable: true,
    value: DOMMatrix,
    writable: true,
  });
}

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}
