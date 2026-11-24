import type { Guide } from "./types";

const T = "#e2e8f0";
const Label = ({ x, y, children, color = T }: { x: number; y: number; children: string; color?: string }) => (
  <text x={x} y={y} fill={color} fontSize={7} textAnchor="middle" fontFamily="inherit">
    {children}
  </text>
);

const AnglePicture = (
  <svg viewBox="0 0 220 90" width="100%" role="img" aria-label="Hitting the ball with the end of the paddle sends it off at a sharp angle, the middle sends it straight up">
    <rect x="2" y="2" width="216" height="74" rx="6" fill="#151a36" stroke="#7c3aed" strokeOpacity="0.4" />
    <rect x="70" y="62" width="80" height="8" rx="4" fill="#a78bfa" />
    <path d="M110 58 L110 14" stroke="#22d3a6" strokeWidth="1.5" strokeDasharray="3 2" />
    <path d="M146 58 L196 14" stroke="#22d3a6" strokeWidth="1.5" strokeDasharray="3 2" />
    <path d="M74 58 L24 14" stroke="#22d3a6" strokeWidth="1.5" strokeDasharray="3 2" />
    <circle cx="110" cy="56" r="4" fill="#fff" />
    <Label x={110} y={10}>middle: straight up</Label>
    <Label x={196} y={10}>end: sharp</Label>
    <Label x={24} y={10}>end: sharp</Label>
    <Label x={110} y={86}>Where the ball lands on the paddle sets its angle</Label>
  </svg>
);

const BricksPicture = (
  <svg viewBox="0 0 220 56" width="100%" role="img" aria-label="Green bricks break in one hit, violet in two, red in three; steel never breaks">
    {[
      ["#22d3a6", "1 hit"],
      ["#a78bfa", "2 hits"],
      ["#f43f5e", "3 hits"],
      ["#94a3b8", "steel"],
    ].map(([c, t], i) => (
      <g key={t}>
        <rect x={10 + i * 52} y={10} width={44} height={16} rx={3} fill={c} />
        <Label x={32 + i * 52} y={42}>{t}</Label>
      </g>
    ))}
  </svg>
);

const guide: Guide = {
  intro:
    "Keep the ball bouncing with your paddle and break every brick on the screen. The ball gets faster every 15 seconds, so the longer you take, the harder it gets.",
  sections: [
    {
      title: "Moving the paddle",
      body: [
        "On a phone: put your finger anywhere on the field and slide left or right. The paddle follows your finger.",
        "On a computer: move the mouse, or hold the ← and → arrow keys (or A and D).",
        "The ball starts on the paddle. Tap (or press space) to launch it. If you wait, it launches by itself after about 2½ seconds.",
      ],
    },
    {
      title: "Aiming with the paddle",
      body: [
        "Where the ball touches the paddle decides where it goes next.",
        "Hit it with the middle of the paddle and it goes nearly straight up. Hit it near an end and it flies off at a sharp angle towards that side.",
        "Use the ends to reach the bricks in the corners and to get the ball behind a row.",
      ],
      picture: AnglePicture,
      caption: "Steer the ball by choosing which part of the paddle it hits.",
    },
    {
      title: "Bricks",
      body: [
        "Green bricks break in one hit, violet in two and red in three. A cracked brick has been hit already.",
        "Grey steel bricks never break. You don't need to break them to clear the stage; bounce round them.",
        "Each hit scores 10 points times the stage. Break more than two bricks in a row without the ball touching your paddle and each extra one earns a streak bonus.",
      ],
      picture: BricksPicture,
    },
    {
      title: "Balls, speed and clearing",
      body: [
        "You have 3 balls (the dots above the field). Let the ball fall past the paddle and you lose one.",
        "Every 15 seconds the ball speeds up (shown as ⚡ x2, x3…), up to a top speed.",
        "Break every brick (not steel) to clear the stage. You get a bonus of 500 × stage, plus 250 × stage for each ball you still have.",
        "Stages: Warm-up, Double layer, Diamond, Steel gates and Overdrive. Each one starts faster and gives you a shorter paddle.",
      ],
    },
  ],
  tips: [
    "Get the ball above the bricks: it bounces around up there and breaks lots of bricks without you doing anything.",
    "Watch the ball, not the paddle. Move to where the ball will land early.",
    "Clear quickly. The longer you play, the faster the ball goes.",
    "On weekly leaderboards each level has a timer, and clearing it faster earns a speed bonus.",
  ],
};

export default guide;
