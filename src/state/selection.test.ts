import { describe, expect, it } from "vitest";
import { buildScope } from "@/state/selection";

describe("buildScope", () => {
  it("includes all four segments separated by `|`", () => {
    const scope = buildScope("/home/u/repo", "main", "feature/x", "abc123");
    expect(scope).toBe("/home/u/repo|main|feature/x|abc123");
  });

  it("substitutes empty string when no commit is selected", () => {
    expect(buildScope("/r", "main", "feat")).toBe("/r|main|feat|");
    expect(buildScope("/r", "main", "feat", null)).toBe("/r|main|feat|");
  });

  it("produces distinct keys for cumulative vs single-commit views", () => {
    const cumulative = buildScope("/r", "main", "feat", null);
    const single = buildScope("/r", "main", "feat", "abc");
    expect(cumulative).not.toBe(single);
  });

  it("is sensitive to branch swap", () => {
    expect(buildScope("/r", "main", "feat")).not.toBe(
      buildScope("/r", "feat", "main"),
    );
  });
});
