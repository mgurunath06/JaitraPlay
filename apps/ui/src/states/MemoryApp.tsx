import { useState } from "react";
import { reactMimo } from "../components/mimo";

const SYMBOLS = [
  "🐶", "🐱", "🦁", "🐘", "🐼", "🐸", "🦋", "🐝",
  "🍎", "🍌", "🍓", "🍇", "🥕", "🌽", "⚽", "🏀",
  "🚗", "🚲", "🚀", "✈️", "⭐", "🌈", "☀️", "🌙",
  "❤️", "💎", "🎵", "🎈", "🎁", "🧸", "📚", "🏠",
] as const;
type BoardSize = 4 | 6 | 8;
interface Card { pair: number; label: string }

function shuffle<T>(values: T[], random: () => number): void {
  for (let index = values.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [values[index], values[swap]] = [values[swap], values[index]];
  }
}

export function buildMemoryDeck(size: BoardSize, random = Math.random): Card[] {
  const facePool = [...SYMBOLS];
  shuffle(facePool, random);
  const faces = facePool.slice(0, size * size / 2);
  const pairs = faces.flatMap((label, pair) => [{ pair, label }, { pair, label }]);
  for (let attempt = 0; attempt < 200; attempt++) {
    const deck = [...pairs];
    shuffle(deck, random);
    const positions = new Map<number, number[]>();
    deck.forEach((card, index) => positions.set(card.pair, [...(positions.get(card.pair) ?? []), index]));
    const separated = [...positions.values()].every(([first, second]) => {
      const rowDistance = Math.abs(Math.floor(first / size) - Math.floor(second / size));
      const columnDistance = Math.abs(first % size - second % size);
      return rowDistance + columnDistance > 1;
    });
    if (separated) return deck;
  }
  // A valid non-adjacent fallback for an unusable random source.
  return faces.flatMap((label, pair) => [{ pair, label }]).concat(
    faces.map((label, pair) => ({ pair, label })),
  );
}

export function MemoryApp({ onBack }: { onBack: () => void }) {
  const [size, setSize] = useState<BoardSize>(4);
  const [cards, setCards] = useState(() => buildMemoryDeck(4));
  const [open, setOpen] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [stars, setStars] = useState(0);
  const complete = matched.length === cards.length;

  const reset = (nextSize = size) => {
    setSize(nextSize); setCards(buildMemoryDeck(nextSize)); setOpen([]); setMatched([]);
  };
  const turn = (index: number) => {
    if (complete || matched.includes(index) || open.includes(index)) return;
    const nextOpen = [...(open.length === 1 ? open : []), index];
    setOpen(nextOpen);
    if (nextOpen.length === 2 && cards[nextOpen[0]].pair === cards[nextOpen[1]].pair) {
      const nextMatched = [...matched, ...nextOpen];
      setMatched(nextMatched); setOpen([]);
      if (nextMatched.length === cards.length) { setStars(value => value + 1); reactMimo("correct"); }
    }
  };

  return <section className="panel game-panel" aria-labelledby="memory-title">
    <div className="game-toolbar">
      <button className="back-button game-back" type="button" onClick={onBack}>← Exit to home</button>
      <span className="game-name" id="memory-title">🧠 Memory Match</span>
      <span className="score" aria-label={`${stars} stars`}>⭐ {stars}</span>
    </div>
    <h2 className="game-question">Find every matching pair</h2>
    <div className="memory-size-picker" role="group" aria-label="Memory board size">
      {([4, 6, 8] as const).map(value => <button key={value} type="button" aria-pressed={size === value} onClick={() => reset(value)}>{value} × {value}</button>)}
    </div>
    <div className={`memory-grid memory-size-${size}`}>
      {cards.map((card, index) => {
        const visible = open.includes(index) || matched.includes(index);
        return <button key={`${card.pair}-${index}`} type="button" className={`memory-card ${visible ? "visible" : ""}`} onClick={() => turn(index)} aria-label={visible ? card.label : `Hidden card ${index + 1}`}><span aria-hidden="true">{visible ? card.label : "?"}</span></button>;
      })}
    </div>
    {complete && <div className="game-feedback success" role="status"><strong>You found every pair! ⭐</strong><button type="button" className="next-button" onClick={() => reset()}>New matching game →</button></div>}
  </section>;
}
