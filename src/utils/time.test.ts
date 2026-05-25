import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  relativeTimeFromMs,
  relativeTimeFromSeconds,
} from "@/utils/time";

// Pin "now" to a stable instant so the tests' arithmetic is deterministic.
const NOW = new Date("2026-05-25T12:00:00Z").getTime();

describe("relativeTimeFromSeconds", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses seconds under a minute", () => {
    expect(relativeTimeFromSeconds(NOW / 1000 - 5)).toBe("5s");
    expect(relativeTimeFromSeconds(NOW / 1000)).toBe("0s");
  });

  it("rounds down to minutes / hours / days", () => {
    expect(relativeTimeFromSeconds(NOW / 1000 - 120)).toBe("2m");
    expect(relativeTimeFromSeconds(NOW / 1000 - 7200)).toBe("2h");
    expect(relativeTimeFromSeconds(NOW / 1000 - 86_400 * 3)).toBe("3d");
  });

  it("crosses into weeks at 14 days", () => {
    expect(relativeTimeFromSeconds(NOW / 1000 - 86_400 * 13)).toBe("13d");
    expect(relativeTimeFromSeconds(NOW / 1000 - 86_400 * 14)).toBe("2w");
  });

  it("crosses into months past 8 weeks", () => {
    expect(relativeTimeFromSeconds(NOW / 1000 - 86_400 * 60)).toBe("2mo");
  });

  it("clamps negative deltas (future timestamps) to 0", () => {
    expect(relativeTimeFromSeconds(NOW / 1000 + 1000)).toBe("0s");
  });
});

describe("relativeTimeFromMs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("matches the seconds variant after unit conversion", () => {
    expect(relativeTimeFromMs(NOW - 5000)).toBe("5s");
    expect(relativeTimeFromMs(NOW - 60_000 * 30)).toBe("30m");
  });
});
