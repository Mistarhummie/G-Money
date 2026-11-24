import type { Guide } from "./types";

const T = "#e2e8f0";
const Label = ({ x, y, children, color = T }: { x: number; y: number; children: string; color?: string }) => (
  <text x={x} y={y} fill={color} fontSize={7} textAnchor="middle" fontFamily="inherit">
    {children}
  </text>
);

const PullPicture = (
  <svg viewBox="0 0 220 96" width="100%" role="img" aria-label="Pull the stone back and down; it flies up and forward the opposite way">
    <rect x="2" y="2" width="216" height="80" rx="6" fill="#1e1b4b" />
    <rect x="2" y="70" width="216" height="12" fill="#065f46" />
    <path d="M40 70 L40 52 L32 38 M40 52 L48 38" stroke="#a16207" strokeWidth="5" strokeLinecap="round" fill="none" />
    <path d="M32 38 L22 56 L48 38" stroke="#f43f5e" strokeWidth="1.5" fill="none" />
    <circle cx="22" cy="56" r="5" fill="#e2e8f0" />
    <path d="M38 46 L26 54" stroke="#facc15" strokeWidth="1.5" strokeDasharray="2 2" />
    <path d="M40 40 Q100 -6 170 40" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.5" strokeDasharray="1 5" fill="none" strokeLinecap="round" />
    <circle cx="176" cy="44" r="8" fill="#5eead4" />
    <Label x={30} y={92}>Pull back</Label>
    <Label x={110} y={92}>It flies the opposite way</Label>
    <Label x={176} y={92}>Pop the orb</Label>
  </svg>
);

const ThingsPicture = (
  <svg viewBox="0 0 220 60" width="100%" role="img" aria-label="Crates break when hit hard, steel never breaks, springs bounce the stone off fast">
    <rect x="16" y="10" width="28" height="28" fill="#b45309" stroke="#78350f" strokeWidth="2" />
    <rect x="94" y="10" width="28" height="28" fill="#94a3b8" />
    <rect x="166" y="26" width="40" height="10" rx="4" fill="#22d3a6" />
    <Label x={30} y={52}>Crate: smash it</Label>
    <Label x={108} y={52}>Steel: bounces</Label>
    <Label x={186} y={52}>Spring: launches</Label>
  </svg>
);

const guide: Guide = {
  intro:
    "Pull back the sling and let go to throw a stone. Pop every glowing orb before your stones run out. The fewer stones you use, the more points you get.",
  sections: [
    {
      title: "Throwing",
      body: [
        "Press anywhere on the field and drag backwards (away from where you want the stone to go), then let go.",
        "The further you pull, the harder the throw. The bar under the sling shows the power; it turns red at full power.",
        "The stone flies the opposite way to your pull, and gravity curves it back down.",
        "While you pull, white dots show the start of the flight. The guide gets shorter each stage and is gone on the last one.",
      ],
      picture: PullPicture,
      caption: "Drag back and down to throw up and forward.",
    },
    {
      title: "What's on the field",
      body: [
        "Orbs: touch one with the stone to pop it. Some orbs glide back and forth, so time your throw.",
        "Crates: a hard hit smashes straight through; a soft hit only cracks it. A cracked crate breaks next time.",
        "Steel: never breaks. The stone bounces off, so you can use it for bank shots.",
        "Springs (green): the stone bounces off faster than it arrived.",
        "Wind (last stage): pushes the stone left or right. The arrow at the top shows which way and how strong.",
      ],
      picture: ThingsPicture,
    },
    {
      title: "Points and clearing",
      body: [
        "Each orb is worth 100 × stage. Pop two or more with one stone for a combo: the second is worth double, the third triple, and so on.",
        "Smashing a crate is worth 20 × stage.",
        "Pop every orb to clear the stage. Each stone you didn't need is worth another 300 × stage.",
        "Run out of stones with orbs left and the game ends without clearing it.",
      ],
    },
    {
      title: "The five stages",
      body: [
        "1. First shots: 3 orbs in the open, 5 stones.",
        "2. Crate cover: orbs behind a wall of crates, 6 stones.",
        "3. On the move: two orbs glide up and down or side to side.",
        "4. Bank shot: two orbs under a steel roof. Lob it in low or bounce it off the back wall or the spring.",
        "5. Storm: wind, moving orbs and no aiming guide.",
      ],
    },
  ],
  tips: [
    "Line up orbs that sit in a row and get them with one stone for the combo.",
    "For moving orbs, watch one full trip first, then throw a moment before it reaches the spot.",
    "A stone that's still rolling can still pop an orb, so low, skimming throws are useful too.",
  ],
};

export default guide;
