import { describe, expect, it } from "vitest";
import { createAuditEvent } from "../audit";

describe("review audit events", () => {
  it("records reviewer metadata without document or finding text", () => {
    const event = createAuditEvent(
      "accept",
      "finding-1",
      "gemini-test",
      "prompt-v1",
      "2026-11-02T10:00:00.000Z",
    );

    expect(event).toEqual({
      action: "accept",
      findingId: "finding-1",
      modelName: "gemini-test",
      promptVersion: "prompt-v1",
      timestamp: "2026-11-02T10:00:00.000Z",
    });
    expect(JSON.stringify(event)).not.toContain("sourceText");
    expect(JSON.stringify(event)).not.toContain("value");
  });
});
