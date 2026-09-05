import React from "react";
import type { ReactNode } from "react";
import type { VisualEntity, VisualKind } from "../packages/contracts/visual";

export type EverydayGlyphProps = {
  kind: VisualKind;
  color: string;
  count?: number;
  values?: number[];
  variant?: VisualEntity["variant"];
  state?: number;
  frame?: number;
};

export const EVERYDAY_KINDS = [
  "sun", "battery", "bulb", "house", "plant", "root", "flower", "seed", "water", "cloud",
  "gear", "turbine", "magnet", "speaker", "book", "document", "person", "brain", "chip",
  "computer", "database", "magnifier", "clock", "shield", "container", "token", "filter",
  "memory", "pipe", "thermometer", "globe", "scale", "valve", "check", "cross",
] as const satisfies readonly VisualKind[];

const ink = "#171717";
const paper = "#ffffff";
const green = "#90bd75";
const blue = "#8dc7e8";
const gray = "#b8b8b6";
const clamp = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1));

function Gear({ color }: { color: string }) {
  const points = Array.from({ length: 48 }, (_, i) => {
    const angle = (i * Math.PI) / 24 - Math.PI / 2;
    const radius = i % 4 === 0 || i % 4 === 3 ? 31 : 41;
    return `${50 + Math.cos(angle) * radius},${50 + Math.sin(angle) * radius}`;
  }).join(" ");
  return <g><polygon points={points} fill={color} /><circle cx="50" cy="50" r="15" fill={paper} /></g>;
}

function Plant({ color, state }: { color: string; state: number }) {
  const growth = 0.35 + state * 0.65;
  return <g fill="none">
    <path d="M22 91 Q50 87 78 91" />
    <g transform={`translate(${50 * (1 - growth)} ${89 * (1 - growth)}) scale(${growth})`}>
      <path d="M50 89 C47 66 53 45 50 16" />
      <path d="M49 72 C32 74 20 63 18 52 C34 50 46 56 49 72Z" fill={color} />
      <path d="M51 57 C67 59 79 49 83 36 C68 34 55 42 51 57Z" fill={color} />
      <path d="M50 40 C36 42 26 33 24 21 C38 20 48 28 50 40Z" fill={color} />
      <path d="M50 22 C50 11 57 6 66 6 C66 15 58 21 50 22Z" fill={color} />
      <path d="M23 56 49 72 M78 40 52 57 M28 25 49 40" strokeWidth="1.5" />
    </g>
  </g>;
}

function Tokens({ color, count }: { color: string; count: number }) {
  const amount = Math.max(1, Math.min(16, Math.round(count)));
  const columns = Math.ceil(Math.sqrt(amount));
  const rows = Math.ceil(amount / columns);
  const cell = 82 / columns;
  const radius = Math.min(31, cell * 0.37);
  return <g>{Array.from({ length: amount }, (_, i) => {
    const row = Math.floor(i / columns);
    const rowCount = Math.min(columns, amount - row * columns);
    const x = 50 + (i % columns - (rowCount - 1) / 2) * cell;
    const y = 50 + (row - (rows - 1) / 2) * cell;
    return <g key={i}><circle cx={x} cy={y} r={radius} fill={color} /><circle cx={x} cy={y} r={radius * 0.72} fill="none" strokeWidth="1.2" /></g>;
  })}</g>;
}

/** Original illustrations. The surrounding renderer owns stroke reveal and timing.
 * Coordinates fit 0..100; no canvas, labels, branding, random or ambient motion.
 * State is a deliberate amount (charge, light, growth, fill, heat, opening), not time.
 */
export function EverydayGlyph({ kind, color, count, variant, state: suppliedState }: EverydayGlyphProps): ReactNode {
  const state = clamp(suppliedState ?? (variant === "closed" || variant === "negative" ? 0 : 1));
  switch (kind) {
    case "sun":
      return <g fill="none">
        {Array.from({ length: 12 }, (_, i) => <path key={i} d="M50 8 50 17" transform={`rotate(${i * 30} 50 50)`} />)}
        <circle cx="50" cy="50" r="25" fill={color} />
      </g>;
    case "battery":
      return <g fill="none" transform={variant === "vertical" ? "rotate(-90 50 50)" : undefined}>
        <path d="M83 40 H91 V60 H83" fill={gray} />
        <rect x="9" y="27" width="74" height="46" rx="5" fill={paper} />
        <rect x="16" y="34" width={60 * state} height="32" rx="1" fill={color} stroke="none" />
        {[1, 2].map(i => <path key={i} d={`M${16 + i * 20} 34 V66`} stroke={paper} strokeWidth="3" />)}
        <path d="M19 49 H29 M62 49 H72 M67 44 V54" />
      </g>;
    case "bulb":
      return <g fill="none">
        <path d="M37 66 C37 58 25 51 25 34 C25 1 75 1 75 34 C75 51 63 58 63 66Z" fill={paper} />
        <path d="M37 66 C37 58 25 51 25 34 C25 1 75 1 75 34 C75 51 63 58 63 66Z" fill={color} fillOpacity={state} />
        <path d="M43 66 41 43 50 50 59 43 57 66" />
        <path d="M37 66 H63 V81 L57 89 H43 L37 81Z" fill={gray} />
        <path d="M38 72 H62 M39 79 H61 M45 89 V93 H55 V89" />
        <g opacity={state}><path d="M9 34 H17 M83 34 H91 M17 10 23 17 M77 17 83 10 M12 60 20 55 M80 55 88 60" /></g>
      </g>;
    case "house":
      return <g fill="none">
        <path d="M66 27 V12 H79 V38" fill={gray} />
        <path d="M20 44 H80 V89 H20Z" fill={color} />
        <path d="M9 47 50 11 91 47 83 55 50 27 17 55Z" fill="#e6aa78" />
        <path d="M43 89 V59 H61 V89" fill={paper} />
        <rect x="27" y="59" width="11" height="15" fill={blue} />
        <rect x="66" y="59" width="8" height="15" fill={blue} />
        <path d="M32.5 60 V74 M28 66 H37" strokeWidth="1.4" />
        <circle cx="56" cy="75" r="1.4" fill={ink} stroke="none" />
        <path d="M14 90 H86" />
      </g>;
    case "plant": return <Plant color={color} state={state} />;
    case "root":
      return <g fill="none">
        <path d="M9 25 Q28 22 49 25 T91 25" />
        <path d="M51 8 V28 C55 45 46 58 50 88" stroke={color} strokeWidth="6" />
        <path d="M51 8 V28 C55 45 46 58 50 88 M51 34 31 46 20 48 M33 45 30 60 M50 47 71 57 83 56 M69 56 76 69 M49 60 35 72 25 74 M36 71 36 83 M49 74 62 84 65 92" />
        <path d="M15 35 19 36 M78 36 82 34 M14 66 17 68 M83 79 87 80" stroke={gray} strokeWidth="1.5" />
      </g>;
    case "flower":
      return <g fill="none">
        <path d="M49 91 C48 76 54 56 50 41" />
        <path d="M50 77 C32 79 21 65 21 58 C38 57 48 66 50 77Z M51 64 C64 66 76 57 79 46 C63 45 53 54 51 64Z" fill={green} />
        <g transform={`translate(50 31) scale(${0.55 + state * 0.45}) translate(-50 -31)`}>
          {Array.from({ length: 5 }, (_, i) => <ellipse key={i} cx="50" cy="17" rx="11" ry="14" fill={color} transform={`rotate(${i * 72} 50 31)`} />)}
          <circle cx="50" cy="31" r="10" fill="#f2cd66" />
          <path d="M46 29 H46.2 M53 28 H53.2 M50 35 H50.2" />
        </g>
      </g>;
    case "seed":
      return <g fill="none">
        <path d="M27 79 C5 51 30 24 72 17 C91 45 76 77 50 84 C39 88 32 84 27 79Z" fill={color} />
        <path d="M30 76 C46 67 61 49 68 26" />
        <path d="M28 59 C28 49 35 39 45 35" stroke={paper} strokeWidth="4" />
      </g>;
    case "water":
      return <g fill="none">
        <path d="M50 8 C44 27 20 44 20 64 C20 100 81 100 81 64 C81 44 57 27 50 8Z" fill={color} />
        <path d="M31 63 C29 73 36 80 43 81" stroke={paper} strokeWidth="5" />
      </g>;
    case "cloud":
      return <g fill="none"><path d="M26 76 C-1 76 1 43 24 42 C24 14 63 11 71 37 C95 29 104 67 82 75Z" fill={color} /><path d="M24 42 C31 42 35 45 37 50 M71 37 C67 39 65 42 64 46" /></g>;
    case "gear": return <Gear color={color} />;
    case "turbine":
      return <g fill="none">
        <path d="M46 45 42 93 H58 L54 45" fill={gray} />
        {[0, 120, 240].map(angle => <path key={angle} d="M47 43 C44 30 45 16 51 5 C57 18 57 32 52 43Z" fill={color} transform={`rotate(${angle} 50 45)`} />)}
        <circle cx="50" cy="45" r="6" fill={paper} /><path d="M33 94 H67" />
      </g>;
    case "magnet":
      return <g fill="none" transform={variant === "horizontal" ? "rotate(-90 50 50)" : undefined}>
        <path d="M15 18 H35 V56 C35 76 65 76 65 56 V18 H85 V58 C85 106 15 106 15 58Z" fill={color} />
        <path d="M15 18 H35 V36 H15Z" fill="#e58d85" /><path d="M65 18 H85 V36 H65Z" fill={blue} />
      </g>;
    case "speaker":
      return <g fill="none">
        <rect x="9" y="13" width="52" height="75" rx="5" fill={color} />
        <circle cx="35" cy="35" r="10" fill={paper} /><circle cx="35" cy="65" r="16" fill={gray} /><circle cx="35" cy="65" r="6" fill={paper} />
        <g opacity={state}><path d="M70 38 Q79 50 70 62 M78 28 Q95 50 78 72 M85 20 Q108 50 85 80" /></g>
      </g>;
    case "book": {
      const spread = 9 + state * 31;
      return <g fill="none">
        <path d={`M50 24 Q${50 - spread / 2} 9 ${50 - spread} 17 V79 Q${50 - spread / 2} 73 50 86 Q${50 + spread / 2} 73 ${50 + spread} 79 V17 Q${50 + spread / 2} 9 50 24Z`} fill={color} />
        <path d={`M50 28 Q${50 - spread / 2} 17 ${54 - spread} 22 V73 Q${50 - spread / 2} 71 50 82 Q${50 + spread / 2} 71 ${46 + spread} 73 V22 Q${50 + spread / 2} 17 50 28Z`} fill={paper} />
        <path d="M50 28 V82" />
        {[34, 45, 56, 67].map(y => <path key={y} d={`M${50 - spread * 0.78} ${y - 4} Q${50 - spread / 2} ${y - 5} ${50 - spread * 0.16} ${y} M${50 + spread * 0.16} ${y} Q${50 + spread / 2} ${y - 5} ${50 + spread * 0.78} ${y - 4}`} strokeWidth="1.4" opacity={state} />)}
      </g>;
    }
    case "document":
      return <g fill="none">
        <path d="M21 8 H63 L81 26 V92 H21Z" fill={paper} />
        <path d="M63 8 V26 H81" fill={color} />
        <rect x="31" y="37" width="20" height="13" fill={color} /><path d="M58 38 H70 M58 47 H70 M31 60 H70 M31 70 H70 M31 80 H58" />
      </g>;
    case "person":
      return <g fill="none">
        <path d="M37 62 C24 65 14 72 14 89 H86 C86 72 75 64 63 62" fill={color} />
        <path d="M41 54 V65 Q50 77 59 65 V54" fill="#f1d3b3" />
        <path d="M28 32 C20 27 22 19 28 17 C28 4 47 3 51 10 C65 -1 80 15 74 25 C82 31 74 37 71 41 H29Z" fill="#42413e" />
        <path d="M30 31 C25 25 22 39 30 42 C30 63 70 63 70 42 C78 39 75 25 69 31 V23 Q60 28 51 18 Q43 30 30 27Z" fill="#f1d3b3" />
        <path d="M39 38 H40 M60 38 H61 M50 39 47 46 H51 M42 51 Q50 57 58 51 M28 78 V89 M72 78 V89" />
      </g>;
    case "brain":
      return <g fill="none">
        <path d="M50 17 C43 3 27 7 24 21 C10 21 7 34 14 43 C2 54 8 67 21 69 C17 82 32 91 44 82 L50 87 56 82 C70 91 83 81 79 69 C93 66 98 53 86 43 C94 32 87 19 75 21 C72 7 57 3 50 17Z" fill={color} />
        <path d="M50 18 V86 M25 22 C35 21 40 28 35 35 M14 43 C22 38 33 44 31 54 M21 69 C30 68 40 60 35 51 M44 24 C37 36 43 42 50 42 M33 77 Q34 68 45 68 M75 22 C65 21 60 28 65 35 M86 43 C78 38 67 44 69 54 M79 69 C70 68 60 60 65 51 M56 24 C63 36 57 42 50 42 M67 77 Q66 68 55 68" />
      </g>;
    case "chip":
      return <g fill="none">
        {[29, 43, 57, 71].map(position => <path key={position} d={`M${position} 9 V21 M${position} 79 V91 M9 ${position} H21 M79 ${position} H91`} strokeWidth="4" />)}
        <rect x="20" y="20" width="60" height="60" rx="4" fill={color} /><rect x="32" y="32" width="36" height="36" rx="2" fill={paper} /><path d="M40 43 H60 M40 51 H60 M40 59 H52" strokeWidth="1.5" />
      </g>;
    case "computer":
      return <g fill="none">
        <path d="M43 71 40 88 H60 L57 71" fill={gray} /><path d="M28 91 H72" strokeWidth="4" />
        <rect x="9" y="15" width="82" height="58" rx="4" fill={gray} /><path d="M14 21 H86 V62 H14Z" fill={color} />
        <path d="M34 32 23 41 34 50 M66 32 77 41 66 50 M56 29 46 53" /><circle cx="50" cy="68" r="1.3" fill={ink} stroke="none" />
      </g>;
    case "database":
      return <g fill="none">
        <path d="M18 23 V78 C18 96 82 96 82 78 V23" fill={color} />
        <ellipse cx="50" cy="23" rx="32" ry="13" fill={color} />
        <path d="M18 41 C18 59 82 59 82 41 M18 60 C18 78 82 78 82 60" />
        <path d="M26 59 30 60 M26 79 30 80" stroke={paper} strokeWidth="3" />
      </g>;
    case "magnifier":
      return <g fill="none">
        <path d="M61 60 89 84 Q92 88 87 93 Q83 95 80 91 L56 65Z" fill={color} />
        <circle cx="40" cy="40" r="29" fill={color} /><circle cx="40" cy="40" r="22" fill={paper} /><path d="M25 40 Q25 26 38 25" stroke={blue} strokeWidth="4" />
      </g>;
    case "clock":
      return <g fill="none">
        <circle cx="50" cy="50" r="40" fill={color} /><circle cx="50" cy="50" r="32" fill={paper} />
        {[0, 90, 180, 270].map(angle => <path key={angle} d="M50 21 V26" transform={`rotate(${angle} 50 50)`} />)}
        <path d="M50 50 V29" transform={`rotate(${state * 300} 50 50)`} /><path d="M50 50 63 38" /><circle cx="50" cy="50" r="2" fill={ink} />
      </g>;
    case "shield":
      return <g fill="none">
        <path d="M50 7 Q70 19 86 20 V46 C85 67 70 83 50 94 C30 83 15 67 14 46 V20 Q30 19 50 7Z" fill={color} />
        <path d="M50 18 Q66 27 76 28 V47 C74 63 64 76 50 83 C36 76 26 63 24 47 V28 Q34 27 50 18Z" />
        <path d="M34 49 46 61 67 39" strokeWidth="5" />
      </g>;
    case "container":
      return <g fill="none">
        <path d="M18 22 H82 L76 85 Q50 99 24 85Z" fill={paper} />
        <path d={`M${24 - state * 5} ${85 - state * 49} Q50 ${96 - state * 49} ${76 + state * 5} ${85 - state * 49} L76 85 Q50 99 24 85Z`} fill={color} fillOpacity={state > 0 ? 1 : 0} />
        <ellipse cx="50" cy="22" rx="32" ry="9" fill={paper} /><path d="M27 23 Q50 32 73 23" strokeWidth="1.3" />
      </g>;
    case "token": return <Tokens color={color} count={count ?? 1} />;
    case "filter":
      return <g fill="none">
        <path d="M11 16 H89 L60 58 V83 L40 93 V58Z" fill={color} />
        <ellipse cx="50" cy="16" rx="39" ry="8" fill={paper} /><path d="M27 33 H73 M31 40 H69 M37 47 H63 M34 29 44 52 M49 26 V53 M65 29 56 52" strokeWidth="1.3" />
      </g>;
    case "memory":
      return <g fill="none">
        <path d="M25 8 H86 V76 H25Z" fill={gray} /><path d="M17 16 H78 V84 H17Z" fill={color} /><path d="M9 24 H70 V92 H9Z" fill={paper} />
        <path d="M19 37 H58 M19 48 H58 M19 59 H52 M19 72 H35 M19 81 H45" /><path d="M49 24 H62 V46 L55.5 40 49 46Z" fill={color} />
      </g>;
    case "pipe":
      return <g fill="none" transform={variant === "vertical" ? "rotate(90 50 50)" : undefined}>
        <path d="M8 15 H61 V65 H92 V87 H39 V37 H8Z" fill={paper} />
        <path d="M9 26 H50 V76 H91" stroke={color} strokeWidth={12 * state} strokeLinecap="butt" opacity={state} />
        <path d="M11 12 V40 M88 62 V90 M35 60 H64" />
      </g>;
    case "thermometer": {
      const mercuryTop = 66 - state * 47;
      return <g fill="none">
        <path d="M40 65 V16 C40 2 60 2 60 16 V65 C84 81 69 97 50 97 C31 97 16 81 40 65Z" fill={paper} />
        <path d={`M45 75 V${mercuryTop} H55 V75Z`} fill={color} stroke="none" /><circle cx="50" cy="81" r="10" fill={color} stroke="none" />
        {[20, 32, 44, 56].map(y => <path key={y} d={`M66 ${y} H77`} />)}
      </g>;
    }
    case "globe":
      return <g fill="none">
        <path d="M72 11 C112 53 69 92 32 71 M58 78 V91 M43 92 H74" strokeWidth="3.5" />
        <g transform="rotate(-18 46 44)">
          <circle cx="46" cy="44" r="33" fill={color} /><ellipse cx="46" cy="44" rx="14" ry="33" />
          <path d="M13 44 H79 M18 27 Q46 34 74 27 M18 61 Q46 54 74 61 M46 11 V77" strokeWidth="1.5" />
        </g>
      </g>;
    case "scale": {
      const tilt = (1 - state) * 12;
      const leftY = 32 - tilt;
      const rightY = 32 + tilt;
      return <g fill="none">
        <path d="M50 29 V86 M35 91 Q50 81 65 91Z" fill={color} strokeWidth="4" />
        <path d={`M15 ${leftY} 85 ${rightY}`} strokeWidth="4" /><circle cx="50" cy="32" r="6" fill={color} />
        {[[18, leftY], [82, rightY]].map(([x, y]) => <g key={x}>
          <path d={`M${x} ${y} ${x - 13} ${y + 32} M${x} ${y} ${x + 13} ${y + 32}`} />
          <path d={`M${x - 14} ${y + 32} H${x + 14} Q${x + 10} ${y + 46} ${x} ${y + 46} Q${x - 10} ${y + 46} ${x - 14} ${y + 32}Z`} fill={color} />
        </g>)}
      </g>;
    }
    case "valve":
      return <g fill="none">
        <path d="M9 53 H91 V76 H9Z" fill={paper} /><path d="M10 64 H90" stroke={blue} strokeWidth="10" strokeLinecap="butt" opacity={state} />
        <path d="M36 53 V42 H64 V53" fill={color} />
        <g transform={`translate(0 ${-state * 16})`}>
          <path d="M47 43 V27 H53 V43" fill={gray} /><path d="M46 43 H54 V73 H46Z" fill={color} />
          <ellipse cx="50" cy="26" rx="23" ry="6" fill={color} /><path d="M28 26 H72" />
        </g>
        <path d="M15 49 V80 M85 49 V80" strokeWidth="4" />
      </g>;
    case "check": return <g><path d="M9 48 20 38 38 60 80 15 91 25 38 84Z" fill={color} /></g>;
    case "cross": return <g><path d="M20 12 50 42 80 12 88 20 58 50 88 80 80 88 50 58 20 88 12 80 42 50 12 20Z" fill={color} /></g>;
    default: return null;
  }
}

export const Glyph = EverydayGlyph;
