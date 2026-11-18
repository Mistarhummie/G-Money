import type { Guide } from "./types";

// Colours match the game: one colour per digit for your entries, white for the given clues.
const DIGIT = ["", "#7dd3fc", "#6ee7b7", "#fde047", "#fdba74", "#f9a8d4", "#c4b5fd", "#5eead4", "#bef264", "#a5b4fc"];
const BG = "#14123a";
const THIN = "rgba(255,255,255,0.12)";
const THICK = "rgba(165,180,252,0.6)";
const TEXT = "#e2e8f0";
const MUTED = "#94a3b8";
const RED = "#fda4af";

function Label({ x, y, children, color = TEXT, anchor = "start", size = 7, bold = false }: { x: number; y: number; children: string; color?: string; anchor?: "start" | "middle"; size?: number; bold?: boolean }) {
  return (
    <text x={x} y={y} fill={color} fontSize={size} fontWeight={bold ? 700 : 400} textAnchor={anchor} fontFamily="inherit">
      {children}
    </text>
  );
}

/** A digit centred in a cell. Given clues are white and bold; your entries use the digit's colour. */
function Digit({ x, y, s, d, given = false, bad = false }: { x: number; y: number; s: number; d: number; given?: boolean; bad?: boolean }) {
  return (
    <text
      x={x + s / 2}
      y={y + s / 2}
      dy="0.36em"
      fill={bad ? RED : given ? "#ffffff" : DIGIT[d]}
      fontSize={s * 0.62}
      fontWeight={given ? 800 : 600}
      textAnchor="middle"
      fontFamily="inherit"
    >
      {d}
    </text>
  );
}

/** Lines for an n×n grid, with thick lines every 3 cells. */
function Lines({ x, y, s, cols, rows, thickEvery = 3 }: { x: number; y: number; s: number; cols: number; rows: number; thickEvery?: number }) {
  let thin = "";
  let thick = "";
  for (let c = 1; c < cols; c++) {
    const seg = `M${x + c * s} ${y}v${rows * s}`;
    if (c % thickEvery === 0) thick += seg;
    else thin += seg;
  }
  for (let r = 1; r < rows; r++) {
    const seg = `M${x} ${y + r * s}h${cols * s}`;
    if (r % thickEvery === 0) thick += seg;
    else thin += seg;
  }
  return (
    <g>
      <path d={thin} stroke={THIN} strokeWidth={0.5} />
      <path d={thick} stroke={THICK} strokeWidth={1} />
      <rect x={x} y={y} width={cols * s} height={rows * s} rx={1.5} fill="none" stroke={THICK} strokeWidth={1.2} />
    </g>
  );
}

const UnitsPicture = (() => {
  const S = 8;
  const X = 4;
  const Y = 4;
  return (
    <svg viewBox="0 0 200 80" width="100%" role="img" aria-label="A row, a column and a 3 by 3 box on the sudoku grid">
      <rect x={X} y={Y} width={9 * S} height={9 * S} fill={BG} />
      <rect x={X} y={Y + 4 * S} width={9 * S} height={S} fill="#fbbf24" opacity={0.45} />
      <rect x={X + 7 * S} y={Y} width={S} height={9 * S} fill="#38bdf8" opacity={0.45} />
      <rect x={X} y={Y} width={3 * S} height={3 * S} fill="#34d399" opacity={0.45} />
      <Lines x={X} y={Y} s={S} cols={9} rows={9} />
      <rect x={88} y={10} width={8} height={8} rx={1.5} fill="#fbbf24" opacity={0.8} />
      <Label x={100} y={16.5}>Row: 1–9, once each</Label>
      <rect x={88} y={30} width={8} height={8} rx={1.5} fill="#38bdf8" opacity={0.8} />
      <Label x={100} y={36.5}>Column: 1–9, once each</Label>
      <rect x={88} y={50} width={8} height={8} rx={1.5} fill="#34d399" opacity={0.8} />
      <Label x={100} y={56.5}>3×3 box: 1–9, once each</Label>
      <Label x={88} y={74} color={MUTED}>9 rows, 9 columns, 9 boxes</Label>
    </svg>
  );
})();

// One 3×3 box: given clues, your entries, and the selected empty cell.
const BOX: [number, boolean][] = [
  [5, true], [0, false], [8, false],
  [0, false], [3, true], [0, false],
  [6, false], [0, false], [1, true],
];

const PlayPicture = (() => {
  const S = 22;
  const X = 4;
  const Y = 6;
  const PS = 20;
  const PX = 84;
  return (
    <svg viewBox="0 0 210 86" width="100%" role="img" aria-label="Tap an empty cell, then tap a number on the pad">
      <rect x={X} y={Y} width={3 * S} height={3 * S} fill={BG} />
      <rect x={X + S} y={Y} width={S} height={S} fill="#38bdf8" opacity={0.35} />
      <rect x={X + S + 1} y={Y + 1} width={S - 2} height={S - 2} fill="none" stroke="#7dd3fc" strokeWidth={1.4} />
      <Lines x={X} y={Y} s={S} cols={3} rows={3} thickEvery={9} />
      {BOX.map(([d, given], i) => (d ? <Digit key={i} x={X + (i % 3) * S} y={Y + Math.floor(i / 3) * S} s={S} d={d} given={given} /> : null))}
      <Label x={X + 1.5 * S} y={82} anchor="middle" color={MUTED}>White = given clue</Label>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d, i) => {
        const x = PX + (i % 5) * (PS + 4);
        const y = 10 + Math.floor(i / 5) * (PS + 6);
        return (
          <g key={d}>
            <rect x={x} y={y} width={PS} height={PS} rx={5} fill={d ? DIGIT[d] : "rgba(255,255,255,0.12)"} opacity={d === 5 ? 0.35 : 1} />
            <text x={x + PS / 2} y={y + PS / 2} dy="0.36em" fill={d ? "#0f172a" : TEXT} fontSize={d ? 11 : 6} fontWeight={700} textAnchor="middle" fontFamily="inherit">
              {d ? String(d) : "Erase"}
            </text>
          </g>
        );
      })}
      <Label x={PX} y={72}>Tap a cell, then a number.</Label>
      <Label x={PX} y={81} color={MUTED}>Faded = all nine already placed</Label>
    </svg>
  );
})();

const CLASH_ROW = [7, 0, 5, 9, 0, 1, 5, 0, 3];

const ClashPicture = (() => {
  const S = 20;
  const X = 10;
  return (
    <svg viewBox="0 0 200 50" width="100%" role="img" aria-label="Two 5s in the same row are shown in red">
      <rect x={X} y={4} width={9 * S} height={S} fill={BG} />
      {CLASH_ROW.map((d, i) =>
        d === 5 ? <rect key={i} x={X + i * S} y={4} width={S} height={S} fill="#f43f5e" opacity={0.3} /> : null,
      )}
      <Lines x={X} y={4} s={S} cols={9} rows={1} />
      {CLASH_ROW.map((d, i) => (d ? <Digit key={i} x={X + i * S} y={4} s={S} d={d} given={i !== 6} bad={d === 5} /> : null))}
      <path d={`M${X + 2.5 * S} ${4 + S + 3}q${2 * S} 10 ${4 * S} 0`} stroke={RED} strokeWidth={1} fill="none" />
      <Label x={X + 4.5 * S} y={44} anchor="middle" color={RED}>Two 5s in one row: both turn red</Label>
    </svg>
  );
})();

/** A cell's pencil notes: small digits in a 3×3 layout. */
function Notes({ x, y, s, ds }: { x: number; y: number; s: number; ds: number[] }) {
  return (
    <g>
      {ds.map((d) => (
        <text key={d} x={x + (((d - 1) % 3) + 0.5) * (s / 3)} y={y + (Math.floor((d - 1) / 3) + 0.5) * (s / 3)} dy="0.36em" fill={DIGIT[d]} fontSize={s * 0.26} textAnchor="middle" fontFamily="inherit">
          {d}
        </text>
      ))}
    </g>
  );
}

const NotesPicture = (() => {
  const S = 26;
  const strip = (x: number, placed: boolean) => (
    <g>
      <rect x={x} y={6} width={3 * S} height={S} fill={BG} />
      {placed && <rect x={x + 2 * S} y={6} width={S} height={S} fill="#38bdf8" opacity={0.3} />}
      <Lines x={x} y={6} s={S} cols={3} rows={1} />
      <Notes x={x} y={6} s={S} ds={placed ? [1, 7] : [1, 3, 7]} />
      <Notes x={x + S} y={6} s={S} ds={placed ? [2, 6] : [2, 3, 6]} />
      {placed && <Digit x={x + 2 * S} y={6} s={S} d={3} />}
    </g>
  );
  return (
    <svg viewBox="0 0 200 54" width="100%" role="img" aria-label="Pencil notes: placing a 3 removes the 3 note from the other cells in the same row">
      {strip(4, false)}
      <path d="M88 19H108M104 15L108 19L104 23" stroke={TEXT} strokeWidth={1.2} fill="none" strokeLinecap="round" />
      {strip(118, true)}
      <Label x={43} y={48} anchor="middle" color={MUTED}>Notes: maybe 1, 3, 7…</Label>
      <Label x={157} y={48} anchor="middle" color={MUTED}>Place a 3: those 3s go</Label>
    </svg>
  );
})();

const LAST_ROW = [7, 2, 0, 9, 1, 5, 3, 8, 6];

const LastPicture = (() => {
  const S = 20;
  const X = 10;
  return (
    <svg viewBox="0 0 200 52" width="100%" role="img" aria-label="A row with eight numbers and one gap: the gap must be 4">
      <rect x={X} y={4} width={9 * S} height={S} fill={BG} />
      <rect x={X + 2 * S} y={4} width={S} height={S} fill="#34d399" opacity={0.3} />
      <Lines x={X} y={4} s={S} cols={9} rows={1} />
      {LAST_ROW.map((d, i) => (d ? <Digit key={i} x={X + i * S} y={4} s={S} d={d} given /> : null))}
      <text x={X + 2.5 * S} y={4 + S / 2} dy="0.36em" fill={DIGIT[4]} fontSize={S * 0.62} fontWeight={600} textAnchor="middle" fontFamily="inherit" opacity={0.7}>
        ?
      </text>
      <Label x={X + 2.5 * S} y={38} anchor="middle" color={DIGIT[4]} bold>
        Only 4 is missing
      </Label>
      <Label x={X + 2.5 * S} y={47} anchor="middle" color={MUTED}>
        so this cell must be 4
      </Label>
    </svg>
  );
})();

const guide: Guide = {
  intro:
    "Fill the 9 × 9 grid with numbers so that every row, every column and every 3 × 3 box holds 1 to 9 exactly once. Some numbers are given to start you off. Solve it as fast as you can.",
  sections: [
    {
      title: "The goal",
      body: [
        "The grid has 9 rows, 9 columns and 9 boxes of 3 × 3 (the thicker lines mark the boxes).",
        "Each row, each column and each box must end up with the numbers 1, 2, 3, 4, 5, 6, 7, 8 and 9, with no number repeated.",
        "Some cells already have numbers. These are the clues, shown in bold white. You can't change them.",
        "Every puzzle has exactly one correct answer, so you never need to guess.",
        "Harder stages give fewer clues: Easy has 40, Medium 33, Hard 28 and Expert as few as 24.",
      ],
      picture: UnitsPicture,
      caption: "A row (yellow), a column (blue) and a box (green). Each needs 1 to 9 once.",
    },
    {
      title: "How to fill in numbers",
      body: [
        "Tap an empty cell to select it. Its row, column and box light up so you can see what's already there.",
        "Tap a number on the pad below the grid to put it in the cell. Your numbers appear in colour.",
        "To change a number, select the cell and tap a different number. To remove it, tap Erase.",
        "Tap any cell with a number to light up every copy of that number on the board.",
        "A number on the pad fades once all nine of it are on the board.",
        "On a computer: arrow keys move around the grid, 1–9 fill in a number, and 0, Backspace or Delete erase it.",
      ],
      picture: PlayPicture,
      caption: "The selected cell has a blue outline. Tap a number to fill it in.",
    },
    {
      title: "Red numbers (clashes)",
      body: [
        "If you put a number where the same number already sits in that row, column or box, both turn red and your cell shakes.",
        "Fix it by changing or erasing one of them.",
        "Careful: the game only warns you about clashes like this. A wrong number that doesn't clash with anything looks normal, and you'll only find out later when things stop fitting.",
      ],
      picture: ClashPicture,
      caption: "The 5 you placed clashes with a 5 already in the row.",
    },
    {
      title: "Pencil notes",
      body: [
        "Tap ✏️ Pencil notes (or press N) to switch notes on. Now tapping numbers writes small reminders in the cell instead of an answer.",
        "Tap the same number again to remove that note. Switch notes off to go back to filling in answers.",
        "When you place a real number, that same note is cleared from every cell in its row, column and box.",
        "Notes are free: they are not counted as moves.",
      ],
      picture: NotesPicture,
      caption: "Placing a 3 clears the 3 notes from cells in the same row.",
    },
    {
      title: "How to find a number",
      body: [
        "Look for a row, column or box with only one empty cell. The missing number goes there.",
        "Pick a number, say 7. Find a box that has no 7 yet. Cross off every row and column of that box that already has a 7 somewhere else. If only one empty cell is left, the 7 goes there.",
        "Or pick an empty cell and check its row, column and box. If 8 of the 9 numbers are already used, the last one is the answer.",
      ],
      picture: LastPicture,
      caption: "Eight numbers are in this row, so the gap can only be 4.",
    },
    {
      title: "Finishing, time and moves",
      body: [
        "The game ends by itself the moment every cell is correct. There's no button to press.",
        "Your time is the ⏱ clock at the top. In tournaments the fastest correct solve wins; if two times tie, the one with fewer moves wins.",
        "Moves: every time you fill in, change or erase a number counts as one move. Pencil notes don't.",
        "You have up to 60 minutes. A puzzle solved after that doesn't count as cleared.",
        "Give up ends the game without clearing the stage.",
      ],
    },
  ],
  tips: [
    "Start with the rows, columns and boxes that are nearly full. They are the quickest to finish.",
    "Work one number at a time: look at all the 1s on the board and see where the missing 1s must go, then the 2s, and so on.",
    "When a cell has only two or three possible numbers, write them as pencil notes instead of guessing.",
    "Don't guess. A wrong number may not turn red, and fixing it later costs time and extra moves.",
  ],
};

export default guide;
