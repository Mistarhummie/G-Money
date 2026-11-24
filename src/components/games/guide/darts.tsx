import type { Guide } from "./types";

const T = "#e2e8f0";
const Label = ({ x, y, children, color = T, anchor = "middle" }: { x: number; y: number; children: string; color?: string; anchor?: "start" | "middle" }) => (
  <text x={x} y={y} fill={color} fontSize={7} textAnchor={anchor} fontFamily="inherit">
    {children}
  </text>
);

const RingsPicture = (
  <svg viewBox="0 0 220 110" width="100%" role="img" aria-label="The outer thin ring doubles a number, the inner thin ring trebles it, the centre is the bull">
    <circle cx="60" cy="55" r="50" fill="#f43f5e" />
    <circle cx="60" cy="55" r="45" fill="#151a36" />
    <circle cx="60" cy="55" r="32" fill="#22d3a6" />
    <circle cx="60" cy="55" r="28" fill="#e9e4d4" />
    <circle cx="60" cy="55" r="8" fill="#22d3a6" />
    <circle cx="60" cy="55" r="3.5" fill="#f43f5e" />
    <path d="M110 12 L104 12" stroke={T} />
    <Label x={118} y={14} anchor="start">Outer ring: double (x2)</Label>
    <Label x={118} y={32} anchor="start">Inner ring: treble (x3)</Label>
    <Label x={118} y={50} anchor="start">Wide parts: the number</Label>
    <Label x={118} y={68} anchor="start">Green centre: 25</Label>
    <Label x={118} y={86} anchor="start">Red bull: 50 (counts as a double)</Label>
    <Label x={118} y={104} anchor="start" color="#94a3b8">Outside the doubles: 0</Label>
  </svg>
);

const guide: Guide = {
  intro:
    "Throw darts at the board. Your hand sways a little, and the dart lands exactly where the sight is when you throw, so pick your moment.",
  sections: [
    {
      title: "Aiming and throwing",
      body: [
        "On a phone: put your finger on the board and slide it. The sight sits a little above your finger so you can see it. Lift your finger to throw.",
        "On a computer: move the mouse over the board and click to throw.",
        "The sight drifts around the point you aim at (that's your hand swaying). It moves in a steady rhythm, so watch it and throw as it crosses your target.",
        "After each throw the next dart is ready in about half a second. The sight is faded until then.",
        "The sway gets bigger each stage.",
      ],
    },
    {
      title: "Scoring",
      body: [
        "The board has 20 numbered slices. Hit a slice and you score its number.",
        "The thin outer ring doubles the number and the thin inner ring trebles it, so treble 20 (60) is the highest single dart.",
        "The green ring in the middle is 25 and the red bull's-eye is 50.",
      ],
      picture: RingsPicture,
    },
    {
      title: "The stages",
      body: [
        "1. Warm-up: score 150 or more with 9 darts.",
        "2. Treble hunt: score 250 or more with 9 darts.",
        "3. 301: start on 301 and count down to exactly 0 within 15 darts.",
        "4. Steady hands: score 320 or more with 12 darts, with a lot more sway.",
        "5. 501 double out: count 501 down to 0 within 24 darts, and the last dart must be a double (or the bull).",
        "On score stages you throw every dart, and every point counts for the leaderboard even after you pass the target.",
      ],
    },
    {
      title: "Busts",
      body: [
        "On 301 and 501, a dart that would take you below 0 is a bust and scores nothing. You stay where you were.",
        "On 501, leaving exactly 1, or reaching 0 with a dart that isn't a double, is also a bust.",
        "Finishing early earns 50 × stage for each dart you didn't need.",
      ],
    },
  ],
  tips: [
    "Treble 20 is at the top of the board. If you keep missing it, treble 19 (bottom left) is a safer area.",
    "On 501, aim to leave an even number like 32 (double 16) or 40 (double 20) before your finish.",
    "Don't rush. Watch one full sway first and throw when the sight comes back onto your spot.",
  ],
};

export default guide;
