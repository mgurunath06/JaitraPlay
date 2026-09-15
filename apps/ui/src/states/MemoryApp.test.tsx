import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryApp, buildMemoryDeck } from "./MemoryApp";

vi.mock("../components/mimo", () => ({ reactMimo: vi.fn() }));
afterEach(cleanup);

function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

it.each([4, 6, 8] as const)("builds a shuffled %sx%s deck with separated pairs", size => {
  const deck = buildMemoryDeck(size);
  expect(deck).toHaveLength(size * size);
  for (const pair of new Set(deck.map(card => card.pair))) {
    const positions = deck.flatMap((card, index) => card.pair === pair ? [index] : []);
    expect(positions).toHaveLength(2);
    const rowDistance = Math.abs(Math.floor(positions[0] / size) - Math.floor(positions[1] / size));
    const columnDistance = Math.abs(positions[0] % size - positions[1] % size);
    expect(rowDistance + columnDistance).toBeGreaterThan(1);
  }
});

it("uses fresh randomness for both the selected symbols and their positions", () => {
  const first = buildMemoryDeck(4, seededRandom(1));
  const second = buildMemoryDeck(4, seededRandom(2));
  expect(first.map(card => card.label)).not.toEqual(second.map(card => card.label));
  expect(new Set(first.map(card => card.label))).not.toEqual(new Set(second.map(card => card.label)));
});

it("starts at 4x4 and lets the player select boards through 8x8", () => {
  render(<MemoryApp onBack={vi.fn()} />);
  expect(screen.getAllByRole("button", { name: /Hidden card/ })).toHaveLength(16);
  fireEvent.click(screen.getByRole("button", { name: "6 × 6" }));
  expect(screen.getAllByRole("button", { name: /Hidden card/ })).toHaveLength(36);
  fireEvent.click(screen.getByRole("button", { name: "8 × 8" }));
  expect(screen.getAllByRole("button", { name: /Hidden card/ })).toHaveLength(64);
});
