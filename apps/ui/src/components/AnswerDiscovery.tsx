import type { GeneratedQuestion } from "../../../../packages/contracts/src";

const mapPlaces: Record<string, { x: number; y: number; fact: string }> = {
  asia: { x: 235, y: 71, fact: "Asia stretches from the Middle East to the Pacific Ocean." },
  africa: { x: 161, y: 110, fact: "The equator crosses the middle of Africa." },
  antarctica: { x: 169, y: 163, fact: "Antarctica lies around Earth's South Pole." },
  pacific: { x: 40, y: 102, fact: "The Pacific Ocean touches Asia and the Americas." },
  india: { x: 224, y: 99, fact: "India is in southern Asia." },
  japan: { x: 275, y: 84, fact: "Japan is an island country east of Asia." },
  france: { x: 163, y: 69, fact: "France is in western Europe." },
  australia: { x: 269, y: 137, fact: "Australia lies south of Asia." },
};
const geographyFacts: Record<string, string> = {
  north: "On many maps, north points toward the top.",
  equator: "The equator divides Earth into northern and southern halves.",
  island: "An island can be tiny or large enough to hold many towns.",
  river: "Rivers usually flow downhill toward a lake or sea.",
  mountain: "Mountains rise above the land around them.",
  desert: "A desert is defined by very little rain; some deserts are cold.",
  capital: "Maps often mark a capital city with a star.",
  compass: "A compass needle helps people find north.",
  legend: "A map key explains what its symbols mean.",
  scale: "A map scale compares a short map distance with a real journey.",
  east: "On a north-up map, east is to your right.",
  west: "On a north-up map, west is to your left.",
};
const colourHex: Record<string, string> = {
  blue: "#2563eb", red: "#ef4444", green: "#16a34a", yellow: "#facc15",
  purple: "#9333ea", orange: "#f97316", pink: "#ec4899", brown: "#92400e",
};
const riddleFacts: Record<string, string> = {
  umbrella: "An umbrella's curved top helps rain slide away.",
  clock: "A clock's short hand usually shows the hour.",
  book: "A book can tell a story with words, pictures, or both.",
  key: "The shape of a key helps it fit its lock.",
  pencil: "Pencil marks come from graphite, not lead.",
  shoe: "Shoe soles help protect your feet from rough ground.",
  spoon: "A spoon's bowl helps it carry liquids.",
  toothbrush: "A toothbrush's bristles reach around your teeth.",
  ball: "Round balls can roll in many directions.",
  hat: "A wide brim can shade your face from sunlight.",
  scissors: "Scissors use two blades that slide past each other.",
  bed: "A mattress cushions your body while you rest.",
  cup: "A cup's handle can help you hold it.",
  plate: "Plates can be made from ceramic, metal, or wood.",
  chair: "A chair's back helps support you while you sit.",
  lamp: "Lamps turn electrical energy into light.",
  door: "A door swings on hinges or slides on a track.",
  window: "Glass lets light into a room.",
  soap: "Soap helps water lift dirt from your hands.",
  towel: "A towel's tiny loops soak up water.",
  comb: "A comb's teeth separate strands of hair.",
  sock: "Socks help keep your feet warm inside shoes.",
  glove: "A glove gives each finger its own space.",
  backpack: "Two straps help share a backpack's weight.",
  crayon: "Crayons leave colourful wax on paper.",
  ruler: "A ruler helps measure and draw straight lines.",
  bell: "A bell makes sound when it vibrates.",
  camera: "A camera captures light to make a picture.",
  phone: "A phone can carry your voice to someone far away.",
  train: "Train wheels follow rails to stay on their path.",
  boat: "A boat floats because it pushes water aside.",
  airplane: "Air flowing over wings helps an airplane fly.",
  bicycle: "Pedals turn a bicycle's wheels through a chain.",
  apple: "Apples grow on trees and have seeds inside.",
  banana: "Bananas grow in bunches.",
  carrot: "The orange part of a carrot is its root.",
  bread: "Bread dough rises when tiny gas bubbles form.",
  sun: "Sunlight helps plants grow.",
  moon: "The Moon reflects light from the Sun.",
  cloud: "Clouds are made of tiny water droplets or ice crystals.",
};
const colourFacts: Record<string, string> = {
  blue: "Look for blue in the sky and in some flowers.", red: "Many ripe apples are red.",
  green: "Leaves often look green because of chlorophyll.", yellow: "Sunflowers often have yellow petals.",
  purple: "Some grapes and flowers are purple.", orange: "Carrots are usually orange.",
  pink: "Some flowers have pink petals.", brown: "Tree bark often looks brown.",
};

function WorldMap({ x, y, name }: { x: number; y: number; name: string }) {
  return <svg className="discovery-map" viewBox="0 0 320 190" role="img" aria-label={`Illustrated world map showing ${name}`}>
    <rect x="1" y="1" width="318" height="188" rx="18" fill="#d8f0ff" stroke="#9ac8e4" />
    <path d="M19 53 31 38 54 29 76 35 87 52 78 68 64 70 58 91 43 101 30 81 14 75ZM72 100 91 99 105 117 102 139 89 159 76 151 72 127ZM136 46 152 36 173 41 187 54 179 69 170 75 175 90 165 114 151 127 140 108 138 84 127 71ZM185 36 218 27 257 35 292 48 295 69 279 84 263 78 245 95 223 87 210 67 188 63ZM252 126 274 117 295 127 299 145 280 152 255 144ZM75 172 137 166 199 168 267 172 285 180 65 181Z" fill="#8cce9e" stroke="#69a87d" strokeWidth="2" />
    <circle cx={x} cy={y} r="13" fill="#ef5c5c" stroke="white" strokeWidth="4" />
    <circle cx={x} cy={y} r="4" fill="white" />
  </svg>;
}

export function AnswerDiscovery({ question }: { question: GeneratedQuestion }) {
  const answer = question.choices.find(choice => choice.value === question.answer);
  const label = answer?.label ?? question.answer;
  const place = mapPlaces[question.answer];
  const isGeo = question.topic === "geography";
  const isPattern = question.topic === "patterns";
  const sequence = isPattern ? question.prompt.split("? ").at(-1)?.replace(/\s*\?$/, "") : null;
  const swatch = answer?.color ?? (question.topic === "colours" ? colourHex[question.answer] : undefined);
  const visual = isPattern ? <span className="discovery-pattern">{sequence} <strong>→ {label}</strong></span>
    : place ? <WorldMap x={place.x} y={place.y} name={label} />
    : swatch ? <span className="discovery-swatch" style={{ backgroundColor: swatch }} role="img" aria-label={`${question.answer} colour`} />
    : <span className="discovery-emoji" aria-hidden="true">{isGeo ? "🧭" : /^\p{Extended_Pictographic}/u.test(label) ? label.split(" ")[0] : "✨"}</span>;
  const fact = place?.fact ?? geographyFacts[question.answer]
    ?? (question.topic === "riddles" || question.topic === "objects" ? riddleFacts[question.answer] : undefined)
    ?? (question.topic === "colours" ? colourFacts[question.answer] : undefined)
    ?? (isPattern ? question.explanation : undefined)
    ?? question.hint;
  return <section className="answer-discovery" aria-label="Answer discovery">
    <span className="discovery-eyebrow">🔎 Answer discovery</span>
    <div className="discovery-visual">{visual}</div>
    <strong className="discovery-answer">{label}</strong>
    <p><strong>Did you know?</strong> {fact}</p>
  </section>;
}
