import { describe, expect, it } from "vitest";
import { createSSEParser } from "@/lib/sse";

describe("SSE parser", () => {
  it("reassembles an event split across network chunks", () => {
    const events: unknown[] = [];
    const parser = createSSEParser((event) => events.push(event));
    const payload = `data: ${JSON.stringify({ event: "complete", result: { validationId: "v1" } })}\n\n`;

    parser.feed(payload.slice(0, 18));
    parser.feed(payload.slice(18));
    parser.end();

    expect(events).toEqual([{ event: "complete", result: { validationId: "v1" } }]);
  });

  it("flushes a final data line when the stream ends without a blank line", () => {
    const events: unknown[] = [];
    const parser = createSSEParser((event) => events.push(event));

    parser.feed(`data: ${JSON.stringify({ event: "error", error: "failed" })}`);
    parser.end();

    expect(events).toEqual([{ event: "error", error: "failed" }]);
  });
});
