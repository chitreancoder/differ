import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

describe("useDebouncedValue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebouncedValue("first", 100));
    expect(result.current).toBe("first");
  });

  it("does not echo new values before the delay elapses", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 100),
      { initialProps: { value: "a" } },
    );
    rerender({ value: "b" });
    expect(result.current).toBe("a");
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current).toBe("a");
  });

  it("settles on the latest value after the delay", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 100),
      { initialProps: { value: "a" } },
    );
    rerender({ value: "b" });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current).toBe("b");
  });

  it("coalesces rapid changes into one final settle", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 100),
      { initialProps: { value: "a" } },
    );
    rerender({ value: "b" });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    rerender({ value: "c" });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    // 100ms total elapsed, but the timer reset at 50ms when "c" arrived.
    expect(result.current).toBe("a");
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(result.current).toBe("c");
  });
});
