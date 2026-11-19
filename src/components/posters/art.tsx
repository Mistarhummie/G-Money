/**
 * Original poster art for each game: one inline SVG per game, drawn for G-Money.
 * Every drawing uses a 200 x 200 box and its own gradient ids, so many can share a page.
 */

type Art = () => React.ReactElement;

const Chess: Art = () => (
  <svg viewBox="0 0 200 200" aria-hidden>
    <defs>
      <linearGradient id="ch-k" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff7d6" />
        <stop offset="1" stopColor="#e8b44c" />
      </linearGradient>
      <linearGradient id="ch-q" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#4b5163" />
        <stop offset="1" stopColor="#151826" />
      </linearGradient>
    </defs>
    {/* Floor of squares in perspective */}
    <g opacity="0.85">
      <path d="M10 170 L190 170 L160 128 L40 128 Z" fill="#3b2a1a" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <path key={i} d={`M${40 + i * 20} 128 L${60 + i * 20} 128 L${10 + (i + 1) * 30} 170 L${10 + i * 30} 170 Z`} fill={i % 2 ? "#f3d9a4" : "#8a5a2b"} opacity={0.9} />
      ))}
    </g>
    {/* Dark queen, behind */}
    <g transform="translate(118 46)">
      <circle cx="22" cy="6" r="6" fill="url(#ch-q)" />
      <path d="M6 18 L12 10 L17 18 L22 8 L27 18 L32 10 L38 18 L34 40 L10 40 Z" fill="url(#ch-q)" />
      <path d="M12 40 C12 60 6 70 4 80 L40 80 C38 70 32 60 32 40 Z" fill="url(#ch-q)" />
      <rect x="0" y="80" width="44" height="10" rx="4" fill="url(#ch-q)" />
    </g>
    {/* Gold king, in front */}
    <g transform="translate(46 22)">
      <rect x="27" y="0" width="8" height="24" rx="2" fill="url(#ch-k)" />
      <rect x="19" y="8" width="24" height="8" rx="2" fill="url(#ch-k)" />
      <path d="M12 30 Q31 18 50 30 L44 52 L18 52 Z" fill="url(#ch-k)" />
      <path d="M20 52 C20 80 10 94 6 108 L56 108 C52 94 42 80 42 52 Z" fill="url(#ch-k)" />
      <rect x="0" y="108" width="62" height="14" rx="6" fill="url(#ch-k)" />
      <path d="M24 58 C24 80 18 92 15 104" stroke="#fff" strokeOpacity="0.6" strokeWidth="4" fill="none" strokeLinecap="round" />
    </g>
  </svg>
);

const Drafts: Art = () => (
  <svg viewBox="0 0 200 200" aria-hidden>
    <defs>
      <linearGradient id="dr-r" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ff6b6b" />
        <stop offset="1" stopColor="#b91c1c" />
      </linearGradient>
      <linearGradient id="dr-b" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#3f4456" />
        <stop offset="1" stopColor="#0f111a" />
      </linearGradient>
    </defs>
    {[
      [60, 140, "dr-b"],
      [60, 124, "dr-b"],
      [130, 150, "dr-r"],
      [130, 134, "dr-r"],
      [130, 118, "dr-r"],
    ].map(([x, y, g], i) => (
      <g key={i}>
        <ellipse cx={x as number} cy={(y as number) + 8} rx="36" ry="14" fill={`url(#${g})`} />
        <rect x={(x as number) - 36} y={y as number} width="72" height="8" fill={`url(#${g})`} />
        <ellipse cx={x as number} cy={y as number} rx="36" ry="14" fill={`url(#${g})`} stroke="#fff" strokeOpacity="0.25" strokeWidth="2" />
        <ellipse cx={x as number} cy={y as number} rx="22" ry="8" fill="none" stroke="#fff" strokeOpacity="0.2" strokeWidth="2" />
      </g>
    ))}
    {/* Crown on the red king */}
    <path d="M110 108 L114 88 L122 100 L130 82 L138 100 L146 88 L150 108 Z" fill="#fbbf24" stroke="#fff7d6" strokeWidth="2" strokeLinejoin="round" />
    <path d="M40 60 Q100 20 160 60" stroke="#fff" strokeOpacity="0.5" strokeWidth="4" fill="none" strokeDasharray="2 10" strokeLinecap="round" />
  </svg>
);

const Bao: Art = () => (
  <svg viewBox="0 0 200 200" aria-hidden>
    <defs>
      <linearGradient id="ba-w" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#c9864a" />
        <stop offset="1" stopColor="#6b3a17" />
      </linearGradient>
      <radialGradient id="ba-p" cx="0.5" cy="0.35" r="0.6">
        <stop offset="0" stopColor="#2a160a" />
        <stop offset="1" stopColor="#4a2711" />
      </radialGradient>
    </defs>
    <g transform="rotate(-8 100 110)">
      <rect x="14" y="56" width="172" height="104" rx="14" fill="url(#ba-w)" />
      <rect x="14" y="56" width="172" height="104" rx="14" fill="none" stroke="#f3c48b" strokeOpacity="0.5" strokeWidth="2" />
      {[0, 1, 2, 3].map((r) =>
        [0, 1, 2, 3, 4, 5].map((c) => (
          <circle key={`${r}-${c}`} cx={34 + c * 26.5} cy={72 + r * 24} r="9.5" fill="url(#ba-p)" />
        )),
      )}
      {/* Seeds in a few pits */}
      {[
        [34, 72], [60.5, 96], [113.5, 120], [140, 72], [166.5, 144], [87, 144],
      ].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x - 3} cy={y - 1} r="3" fill="#f5efe0" />
          <circle cx={x + 3} cy={y + 1} r="3" fill="#e9dcc0" />
          <circle cx={x} cy={y + 3} r="2.6" fill="#fff" />
        </g>
      ))}
    </g>
    {/* Seeds being sown */}
    {[[150, 36], [164, 26], [176, 40]].map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r="4" fill="#fff8ea" />
    ))}
  </svg>
);

const Connect4: Art = () => (
  <svg viewBox="0 0 200 200" aria-hidden>
    <defs>
      <linearGradient id="c4-b" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#3b82f6" />
        <stop offset="1" stopColor="#1e3a8a" />
      </linearGradient>
    </defs>
    <rect x="24" y="66" width="152" height="120" rx="12" fill="url(#c4-b)" />
    {[0, 1, 2, 3].map((r) =>
      [0, 1, 2, 3, 4].map((c) => {
        const fill =
          (r === 3 && (c === 1 || c === 2)) || (r === 2 && c === 2) ? "#ef4444" : (r === 3 && c === 3) || (r === 2 && c === 3) || (r === 3 && c === 0) ? "#facc15" : "#0b1020";
        return <circle key={`${r}-${c}`} cx={44 + c * 28} cy={84 + r * 28} r="11" fill={fill} />;
      }),
    )}
    {/* Falling disc */}
    <g>
      <path d="M128 10 L128 34 M120 14 L120 28 M136 14 L136 28" stroke="#fde68a" strokeOpacity="0.7" strokeWidth="3" strokeLinecap="round" />
      <circle cx="128" cy="48" r="14" fill="#facc15" stroke="#fff7d6" strokeWidth="3" />
      <circle cx="128" cy="48" r="7" fill="none" stroke="#a16207" strokeOpacity="0.5" strokeWidth="2" />
    </g>
  </svg>
);

const Snake: Art = () => (
  <svg viewBox="0 0 200 200" aria-hidden>
    <defs>
      <linearGradient id="sn-b" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#bef264" />
        <stop offset="0.5" stopColor="#22d3a6" />
        <stop offset="1" stopColor="#0ea5e9" />
      </linearGradient>
    </defs>
    <path
      d="M30 160 C30 120 90 140 100 110 C110 80 50 90 60 60 C68 36 110 40 130 52"
      stroke="url(#sn-b)"
      strokeWidth="24"
      fill="none"
      strokeLinecap="round"
    />
    <path d="M30 160 C30 120 90 140 100 110 C110 80 50 90 60 60" stroke="#fff" strokeOpacity="0.25" strokeWidth="4" fill="none" strokeDasharray="1 14" strokeLinecap="round" />
    <ellipse cx="138" cy="54" rx="20" ry="16" fill="#0ea5e9" />
    <circle cx="142" cy="47" r="5" fill="#fff" />
    <circle cx="143" cy="47" r="2.5" fill="#0b1020" />
    <path d="M157 58 L170 60 M170 60 L176 55 M170 60 L176 66" stroke="#f43f5e" strokeWidth="3" strokeLinecap="round" />
    {/* Apple */}
    <circle cx="160" cy="132" r="16" fill="#ef4444" />
    <circle cx="154" cy="126" r="4" fill="#fff" fillOpacity="0.5" />
    <path d="M160 116 Q162 108 168 106" stroke="#65a30d" strokeWidth="3" fill="none" strokeLinecap="round" />
  </svg>
);

const Blocks: Art = () => {
  const cell = (x: number, y: number, c: string, k: string) => (
    <g key={k}>
      <rect x={x} y={y} width="26" height="26" rx="4" fill={c} />
      <rect x={x + 3} y={y + 3} width="20" height="6" rx="2" fill="#fff" fillOpacity="0.35" />
    </g>
  );
  const cells: [number, number, string][] = [
    [44, 150, "#f43f5e"], [70, 150, "#f43f5e"], [96, 150, "#22d3a6"], [122, 150, "#22d3a6"], [148, 150, "#a78bfa"],
    [44, 124, "#f43f5e"], [96, 124, "#22d3a6"], [122, 124, "#22d3a6"], [148, 124, "#a78bfa"],
    [148, 98, "#a78bfa"], [122, 98, "#facc15"],
  ];
  return (
    <svg viewBox="0 0 200 200" aria-hidden>
      {cells.map(([x, y, c], i) => cell(x, y, c, `c${i}`))}
      {/* Falling T piece */}
      <g transform="rotate(12 90 50)">
        {cell(64, 30, "#38bdf8", "t1")}
        {cell(90, 30, "#38bdf8", "t2")}
        {cell(116, 30, "#38bdf8", "t3")}
        {cell(90, 56, "#38bdf8", "t4")}
      </g>
      <path d="M78 12 L78 24 M104 8 L104 22 M130 12 L130 24" stroke="#bae6fd" strokeOpacity="0.6" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
};

const G2048: Art = () => {
  const tile = (x: number, y: number, n: string, bg: string, fg: string, size = 40, font = 18) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width={size} height={size} rx="8" fill={bg} />
      <text x={x + size / 2} y={y + size / 2 + font * 0.36} textAnchor="middle" fontSize={font} fontWeight="900" fill={fg} fontFamily="var(--font-nunito), sans-serif">
        {n}
      </text>
    </g>
  );
  return (
    <svg viewBox="0 0 200 200" aria-hidden>
      <rect x="20" y="40" width="160" height="150" rx="14" fill="#000" fillOpacity="0.25" />
      {tile(30, 140, "2", "#fef3c7", "#78350f")}
      {tile(76, 140, "4", "#fde68a", "#78350f")}
      {tile(122, 140, "8", "#fb923c", "#fff")}
      {tile(30, 94, "16", "#f97316", "#fff")}
      {tile(122, 94, "64", "#ef4444", "#fff")}
      <g transform="rotate(-6 100 70)">
        {tile(56, 26, "2048", "#facc15", "#fff", 88, 26)}
      </g>
    </svg>
  );
};

const Sudoku: Art = () => {
  const nums = ["5", "", "9", "", "7", "", "1", "", "4"];
  return (
    <svg viewBox="0 0 200 200" aria-hidden>
      <g transform="rotate(-6 100 110)">
        <rect x="30" y="40" width="140" height="140" rx="12" fill="#f5f3ff" />
        {[1, 2].map((i) => (
          <g key={i}>
            <line x1={30 + (i * 140) / 3} y1="40" x2={30 + (i * 140) / 3} y2="180" stroke="#6d28d9" strokeWidth="3" />
            <line x1="30" y1={40 + (i * 140) / 3} x2="170" y2={40 + (i * 140) / 3} stroke="#6d28d9" strokeWidth="3" />
          </g>
        ))}
        {nums.map((n, i) =>
          n ? (
            <text key={i} x={30 + ((i % 3) + 0.5) * (140 / 3)} y={40 + (Math.floor(i / 3) + 0.5) * (140 / 3) + 10} textAnchor="middle" fontSize="30" fontWeight="900" fill="#1e1b4b" fontFamily="var(--font-nunito), sans-serif">
              {n}
            </text>
          ) : null,
        )}
        <rect x={30 + 140 / 3} y={40 + 140 / 3} width={140 / 3} height={140 / 3} fill="#22d3a6" fillOpacity="0.35" />
      </g>
      {/* Pencil */}
      <g transform="rotate(35 150 50)">
        <rect x="130" y="20" width="16" height="70" rx="3" fill="#facc15" />
        <rect x="130" y="20" width="16" height="10" fill="#f472b6" />
        <path d="M130 90 L146 90 L138 106 Z" fill="#fde68a" />
        <path d="M135 100 L141 100 L138 106 Z" fill="#1e1b4b" />
      </g>
    </svg>
  );
};

const Slide: Art = () => {
  const order = [1, 2, 3, 5, 6, 0, 4, 7, 8];
  return (
    <svg viewBox="0 0 200 200" aria-hidden>
      <rect x="28" y="38" width="144" height="144" rx="14" fill="#000" fillOpacity="0.3" />
      {order.map((n, i) => {
        if (!n) return null;
        const x = 34 + (i % 3) * 46;
        const y = 44 + Math.floor(i / 3) * 46;
        return (
          <g key={n}>
            <rect x={x} y={y} width="42" height="42" rx="8" fill="#5eead4" />
            <rect x={x} y={y} width="42" height="21" rx="8" fill="#fff" fillOpacity="0.2" />
            <text x={x + 21} y={y + 29} textAnchor="middle" fontSize="22" fontWeight="900" fill="#134e4a" fontFamily="var(--font-nunito), sans-serif">
              {n}
            </text>
          </g>
        );
      })}
      <path d="M150 100 L176 100 M168 92 L176 100 L168 108" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const Pool: Art = () => (
  <svg viewBox="0 0 200 200" aria-hidden>
    <defs>
      <radialGradient id="po-8" cx="0.35" cy="0.3" r="0.75">
        <stop offset="0" stopColor="#4b5563" />
        <stop offset="1" stopColor="#030712" />
      </radialGradient>
      <radialGradient id="po-y" cx="0.35" cy="0.3" r="0.75">
        <stop offset="0" stopColor="#fef08a" />
        <stop offset="1" stopColor="#ca8a04" />
      </radialGradient>
      <radialGradient id="po-r" cx="0.35" cy="0.3" r="0.75">
        <stop offset="0" stopColor="#fca5a5" />
        <stop offset="1" stopColor="#b91c1c" />
      </radialGradient>
      <linearGradient id="po-c" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#f5deb3" />
        <stop offset="0.7" stopColor="#a0522d" />
        <stop offset="1" stopColor="#3f1d0b" />
      </linearGradient>
    </defs>
    <ellipse cx="100" cy="176" rx="80" ry="10" fill="#000" fillOpacity="0.3" />
    <circle cx="48" cy="150" r="22" fill="url(#po-y)" />
    <circle cx="156" cy="150" r="22" fill="url(#po-r)" />
    <circle cx="100" cy="112" r="50" fill="url(#po-8)" />
    <circle cx="100" cy="112" r="22" fill="#fff" />
    <text x="100" y="124" textAnchor="middle" fontSize="32" fontWeight="900" fill="#0b1020" fontFamily="var(--font-nunito), sans-serif">
      8
    </text>
    <ellipse cx="80" cy="84" rx="14" ry="8" fill="#fff" fillOpacity="0.35" transform="rotate(-30 80 84)" />
    <rect x="96" y="22" width="110" height="9" rx="4.5" fill="url(#po-c)" transform="rotate(-28 96 22)" />
  </svg>
);

const Ludo: Art = () => (
  <svg viewBox="0 0 200 200" aria-hidden>
    <g transform="rotate(-8 100 110)">
      <rect x="26" y="36" width="148" height="148" rx="14" fill="#f8fafc" />
      <rect x="32" y="42" width="56" height="56" rx="10" fill="#ef4444" />
      <rect x="112" y="42" width="56" height="56" rx="10" fill="#22c55e" />
      <rect x="32" y="122" width="56" height="56" rx="10" fill="#3b82f6" />
      <rect x="112" y="122" width="56" height="56" rx="10" fill="#facc15" />
      <path d="M100 110 L88 98 L112 98 Z" fill="#ef4444" />
      <path d="M100 110 L112 98 L112 122 Z" fill="#22c55e" />
      <path d="M100 110 L112 122 L88 122 Z" fill="#facc15" />
      <path d="M100 110 L88 122 L88 98 Z" fill="#3b82f6" />
    </g>
    {/* Pawns */}
    {[
      [60, 64, "#b91c1c"],
      [140, 150, "#a16207"],
      [118, 76, "#15803d"],
    ].map(([x, y, c], i) => (
      <g key={i} transform={`translate(${x} ${y})`}>
        <ellipse cx="0" cy="22" rx="14" ry="5" fill="#000" fillOpacity="0.25" />
        <path d="M-12 20 Q0 -4 12 20 Z" fill={c as string} stroke="#fff" strokeWidth="2" />
        <circle cx="0" cy="-4" r="9" fill={c as string} stroke="#fff" strokeWidth="2" />
      </g>
    ))}
  </svg>
);

const Football: Art = () => (
  <svg viewBox="0 0 200 200" aria-hidden>
    {/* Goal net */}
    <g stroke="#fff" strokeOpacity="0.35" strokeWidth="1.5">
      <rect x="22" y="40" width="156" height="80" fill="none" strokeWidth="5" strokeOpacity="0.9" />
      {Array.from({ length: 12 }, (_, i) => (
        <line key={`v${i}`} x1={22 + i * 13} y1="40" x2={22 + i * 13} y2="120" />
      ))}
      {Array.from({ length: 6 }, (_, i) => (
        <line key={`h${i}`} x1="22" y1={40 + i * 13} x2="178" y2={40 + i * 13} />
      ))}
    </g>
    <path d="M0 196 Q100 150 200 196 Z" fill="#16a34a" />
    <circle cx="112" cy="128" r="34" fill="#fff" />
    <path d="M112 112 L124 121 L119 135 L105 135 L100 121 Z" fill="#0b1020" />
    <path d="M100 121 L84 116 M124 121 L139 114 M119 135 L128 152 M105 135 L95 152 M112 112 L112 96" stroke="#0b1020" strokeWidth="3" />
    <path d="M60 150 L40 156 M64 138 L36 136 M70 126 L48 116" stroke="#fff" strokeOpacity="0.6" strokeWidth="4" strokeLinecap="round" />
  </svg>
);

const Trophy: Art = () => (
  <svg viewBox="0 0 200 200" aria-hidden>
    <defs>
      <linearGradient id="tr-g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fff7d6" />
        <stop offset="0.5" stopColor="#facc15" />
        <stop offset="1" stopColor="#b45309" />
      </linearGradient>
    </defs>
    <path d="M60 40 L140 40 L136 96 Q100 130 64 96 Z" fill="url(#tr-g)" />
    <path d="M60 50 Q30 50 36 76 Q42 96 66 96" stroke="url(#tr-g)" strokeWidth="9" fill="none" />
    <path d="M140 50 Q170 50 164 76 Q158 96 134 96" stroke="url(#tr-g)" strokeWidth="9" fill="none" />
    <rect x="92" y="112" width="16" height="26" fill="url(#tr-g)" />
    <rect x="66" y="138" width="68" height="18" rx="4" fill="url(#tr-g)" />
    <rect x="58" y="156" width="84" height="14" rx="4" fill="#7c3aed" />
    <path d="M100 56 L106 70 L121 71 L109 80 L113 95 L100 86 L87 95 L91 80 L79 71 L94 70 Z" fill="#fff" fillOpacity="0.9" />
  </svg>
);

export type PosterKey =
  | "chessbot"
  | "drafts"
  | "bao"
  | "connect4"
  | "snake"
  | "blocks"
  | "g2048"
  | "sudoku"
  | "slide"
  | "pool"
  | "ludo"
  | "football"
  | "trophy";

export const POSTER_ART: Record<PosterKey, Art> = {
  chessbot: Chess,
  drafts: Drafts,
  bao: Bao,
  connect4: Connect4,
  snake: Snake,
  blocks: Blocks,
  g2048: G2048,
  sudoku: Sudoku,
  slide: Slide,
  pool: Pool,
  ludo: Ludo,
  football: Football,
  trophy: Trophy,
};

/** Background and accent for each poster: a strong gradient with a light in the top corner. */
export const POSTER_THEME: Record<PosterKey, { bg: string; light: string }> = {
  chessbot: { bg: "linear-gradient(160deg,#3b2a6b 0%,#1a1236 60%,#0b1020 100%)", light: "#fbbf24" },
  drafts: { bg: "linear-gradient(160deg,#9f1239 0%,#4c0519 60%,#1a0710 100%)", light: "#fb7185" },
  bao: { bg: "linear-gradient(160deg,#c2410c 0%,#7c2d12 55%,#2a0f05 100%)", light: "#fdba74" },
  connect4: { bg: "linear-gradient(160deg,#2563eb 0%,#1e3a8a 60%,#0b1020 100%)", light: "#facc15" },
  snake: { bg: "linear-gradient(160deg,#15803d 0%,#064e3b 60%,#03140f 100%)", light: "#bef264" },
  blocks: { bg: "linear-gradient(160deg,#7c3aed 0%,#3b0764 60%,#120322 100%)", light: "#38bdf8" },
  g2048: { bg: "linear-gradient(160deg,#f59e0b 0%,#b45309 55%,#3b1a04 100%)", light: "#fef08a" },
  sudoku: { bg: "linear-gradient(160deg,#6d28d9 0%,#312e81 60%,#0b1020 100%)", light: "#22d3a6" },
  slide: { bg: "linear-gradient(160deg,#0d9488 0%,#134e4a 60%,#03201d 100%)", light: "#5eead4" },
  pool: { bg: "linear-gradient(160deg,#047857 0%,#064e3b 55%,#021a14 100%)", light: "#a7f3d0" },
  ludo: { bg: "linear-gradient(160deg,#db2777 0%,#7c3aed 55%,#1e1b4b 100%)", light: "#fde047" },
  football: { bg: "linear-gradient(160deg,#16a34a 0%,#14532d 55%,#0b1020 100%)", light: "#bbf7d0" },
  trophy: { bg: "linear-gradient(160deg,#7c3aed 0%,#312e81 55%,#0b1020 100%)", light: "#facc15" },
};
