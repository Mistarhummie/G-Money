import type { Guide } from "./types";

const T = "#e2e8f0";
const Label = ({ x, y, children, color = T }: { x: number; y: number; children: string; color?: string }) => (
  <text x={x} y={y} fill={color} fontSize={7} textAnchor="middle" fontFamily="inherit">
    {children}
  </text>
);

const ReachPicture = (
  <svg viewBox="0 0 220 90" width="100%" role="img" aria-label="The keeper covers the middle of the goal; the corners are hard to reach but close to the posts">
    <rect x="20" y="10" width="180" height="60" fill="#ffffff" fillOpacity="0.05" />
    <path d="M20 70 L20 10 L200 10 L200 70" stroke="#fff" strokeWidth="3" fill="none" />
    <ellipse cx="110" cy="70" rx="64" ry="48" fill="#f59e0b" fillOpacity="0.25" stroke="#f59e0b" strokeDasharray="3 2" />
    <circle cx="34" cy="58" r="5" fill="#22d3a6" />
    <circle cx="190" cy="20" r="5" fill="#22d3a6" />
    <circle cx="110" cy="50" r="5" fill="#f43f5e" />
    <Label x={110} y={84}>Orange: where the keeper can reach</Label>
  </svg>
);

const ZonesPicture = (
  <svg viewBox="0 0 220 80" width="100%" role="img" aria-label="Online, the keeper picks one of six zones: low or high, left, centre or right">
    <path d="M20 70 L20 6 L200 6 L200 70" stroke="#fff" strokeWidth="3" fill="none" />
    {[0, 1, 2].map((c) =>
      [0, 1].map((r) => (
        <rect key={`${c}${r}`} x={22 + c * 59} y={8 + r * 31} width={57} height={29} rx={3} fill="#22d3a6" fillOpacity={c === 2 && r === 1 ? 0.45 : 0.1} stroke="#22d3a6" strokeOpacity="0.5" />
      )),
    )}
    <rect x="24" y="9" width="16" height="12" fill="#f43f5e" fillOpacity="0.5" />
    <rect x="180" y="9" width="16" height="12" fill="#f43f5e" fillOpacity="0.5" />
    <Label x={110} y={78}>Six zones; the red top corners can&apos;t be saved</Label>
  </svg>
);

const guide: Guide = {
  intro:
    "A penalty shootout: you take a kick, then you go in goal and try to save one. Five kicks each, then sudden death. Score more than the other side to win.",
  sections: [
    {
      title: "Taking a kick",
      body: [
        "Put your finger (or the mouse) on the goal where you want to shoot. A sight shows where the ball will go.",
        "The sight sways a little, more on later stages. Let go (or click) when it's on your spot: the ball goes exactly where the sight is at that moment.",
        "The keeper covers the middle and the area near the ground well. The corners are hard for him to reach, especially the top ones.",
        "But aim too close to a post or the bar and the sway can put it off the post, wide or over. That's the risk.",
        "The computer keeper also leans towards the side you shot at last time, so mix it up.",
        "You have 15 seconds for each kick.",
      ],
      picture: ReachPicture,
      caption: "Green shots beat the keeper; the red one is easy to save.",
    },
    {
      title: "Saving",
      body: [
        "The kicker runs up and shoots. As soon as you see where the ball is going, tap that spot on the goal: your keeper dives towards it.",
        "Your keeper can only dive once, and he takes time to get across, so be quick.",
        "Tap before the kick and you are guessing; if you guess wrong you can't change your mind.",
        "On later stages the computer shoots harder (less time to react) and closer to the corners. Sometimes it misses on its own.",
        "Every player faces the same ten kicks on each stage, in a different order, so it's fair on the leaderboards.",
      ],
    },
    {
      title: "Playing someone online",
      body: [
        "Online, one of you kicks while the other keeps, and you swap every kick. The player listed second takes the first kick.",
        "The keeper picks one of six zones to dive to (low or high; left, centre or right). The pick is locked in secret before the kick, so the kicker can't see it.",
        "The kicker then aims and shoots. The ball lands very close to the aim point, but not exactly, so aiming right at the post can miss.",
        "If the ball goes into the zone the keeper picked, it's saved, except in the very top corners, which no keeper reaches.",
        "Keep the match open on the same phone or browser until your pick is revealed (it happens by itself straight after the kick).",
        "Each move has a 2 minute clock.",
      ],
      picture: ZonesPicture,
    },
    {
      title: "Points and winning",
      body: [
        "100 × stage for each goal you score and each save you make, plus 500 × stage for winning the shootout.",
        "After five kicks each, if it's level, it goes to sudden death: one kick each until one scores and the other doesn't. After ten each it's a draw (not cleared).",
      ],
    },
  ],
  tips: [
    "Low and just inside the post is a good, safe-ish shot. Top corners are unstoppable but easy to miss.",
    "In goal, keep your finger near the middle of the goal so you can reach either side fast.",
    "Online, don't always dive the same way: the other player will notice.",
  ],
};

export default guide;
