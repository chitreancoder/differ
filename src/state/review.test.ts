import { describe, expect, it } from "vitest";
import { truncateSnippet } from "@/state/review";

describe("truncateSnippet", () => {
  it("returns the original when under the line limit", () => {
    const snippet = "one\ntwo\nthree";
    expect(truncateSnippet(snippet)).toBe(snippet);
  });

  it("truncates and appends a `(N more lines)` marker past the limit", () => {
    const lines = Array.from({ length: 60 }, (_, i) => `line ${i}`);
    const out = truncateSnippet(lines.join("\n"));
    expect(out.split("\n").length).toBe(41); // 40 kept + 1 marker
    expect(out).toMatch(/… \(20 more lines\)$/);
  });

  it("handles empty input cleanly", () => {
    expect(truncateSnippet("")).toBe("");
  });
});
