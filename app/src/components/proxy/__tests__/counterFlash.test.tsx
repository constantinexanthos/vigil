import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { CountersPane, FLASH_MS } from "../CountersPane";
import type { ProxyCounter } from "../../../types";

// Counter delta animation — brief acceptance #8. A counter value changes
// from N to N+1 → cell receives the highlight class for ~400ms then drops
// it. Tested via class assertion at +200ms and +500ms.

function counter(queries: number, deduped = 0, rate = 0): ProxyCounter {
  return {
    agent_id: "cc",
    agent_name: "claude-code",
    queries_today: queries,
    queries_deduped: deduped,
    queries_rate_limited: rate,
  };
}

describe("CountersPane delta flash — acceptance #8", () => {
  it("does not flash on initial render", () => {
    render(<CountersPane counters={[counter(100)]} />);
    const cell = screen.getByTestId("counter-queries-cc");
    expect(cell).not.toHaveAttribute("data-flash");
  });

  it("flashes when value increases, then drops the flash after ~400ms", async () => {
    vi.useFakeTimers();
    try {
      const initial = [counter(100)];
      const next = [counter(101)];
      const { rerender } = render(<CountersPane counters={initial} />);

      // Trigger the delta — value goes 100 → 101.
      rerender(<CountersPane counters={next} />);

      // Immediately after re-render the cell carries the flash flag.
      const cell = screen.getByTestId("counter-queries-cc");
      expect(cell).toHaveAttribute("data-flash", "true");

      // Brief asks for "class assertion at +200ms and +500ms". At +200ms
      // the flash is still on; at +500ms (past FLASH_MS=400) it's gone.
      await act(async () => {
        vi.advanceTimersByTime(200);
      });
      expect(cell).toHaveAttribute("data-flash", "true");

      await act(async () => {
        vi.advanceTimersByTime(FLASH_MS); // total elapsed: 600ms > 400ms
      });
      expect(cell).not.toHaveAttribute("data-flash");
    } finally {
      vi.useRealTimers();
    }
  });

  it("flashes the deduped cell when its value changes", () => {
    const { rerender } = render(
      <CountersPane counters={[counter(100, 5)]} />,
    );
    rerender(<CountersPane counters={[counter(100, 6)]} />);
    expect(screen.getByTestId("counter-deduped-cc")).toHaveAttribute(
      "data-flash",
      "true",
    );
    // The unchanged queries-today cell does not flash on this re-render.
    expect(screen.getByTestId("counter-queries-cc")).not.toHaveAttribute(
      "data-flash",
    );
  });

  it("does not flash when a re-render passes identical values", () => {
    const { rerender } = render(
      <CountersPane counters={[counter(100, 5, 2)]} />,
    );
    rerender(<CountersPane counters={[counter(100, 5, 2)]} />);
    expect(screen.getByTestId("counter-queries-cc")).not.toHaveAttribute(
      "data-flash",
    );
    expect(screen.getByTestId("counter-deduped-cc")).not.toHaveAttribute(
      "data-flash",
    );
  });
});
