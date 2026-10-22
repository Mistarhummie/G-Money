import type { ReactNode } from "react";

/** One game's how-to-play guide. Pictures are small inline SVG diagrams. */
export type Guide = {
  /** One or two sentences: what the game is and how you win. */
  intro: string;
  sections: GuideSection[];
  /** Short practical tips, shown last. */
  tips?: string[];
};

export type GuideSection = {
  title: string;
  /** Paragraphs or bullet points (an array renders as a list). */
  body: string | string[];
  picture?: ReactNode;
  /** One line under the picture explaining it. */
  caption?: string;
};
