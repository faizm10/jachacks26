/**
 * AR label colors from Gemini activity strings (best-effort).
 * Tune keyword lists for your demo — natural language is fuzzy.
 */

export type LabelRgbTheme = {
  /** Semi-transparent stroke for box / pill outline */
  boxSemi: string;
  /** Solid accent for corners, glow, badge */
  accent: string;
  /** Pill label text */
  text: string;
};

const EMERALD: LabelRgbTheme = {
  boxSemi: "rgba(52, 211, 153, 0.7)",
  accent: "rgb(52, 211, 153)",
  text: "rgb(110, 231, 183)",
};

const PINK_LOCKED: LabelRgbTheme = {
  boxSemi: "rgba(244, 114, 182, 0.75)",
  accent: "rgb(244, 114, 182)",
  text: "rgb(251, 207, 232)",
};

const SKY_SOCIAL: LabelRgbTheme = {
  boxSemi: "rgba(56, 189, 248, 0.72)",
  accent: "rgb(56, 189, 248)",
  text: "rgb(186, 230, 253)",
};

const AMBER_MOTION: LabelRgbTheme = {
  boxSemi: "rgba(251, 191, 36, 0.7)",
  accent: "rgb(251, 191, 36)",
  text: "rgb(253, 224, 71)",
};

const VIOLET_PHONE: LabelRgbTheme = {
  boxSemi: "rgba(167, 139, 250, 0.72)",
  accent: "rgb(167, 139, 250)",
  text: "rgb(221, 214, 254)",
};

const ROSE_EATING: LabelRgbTheme = {
  boxSemi: "rgba(251, 113, 133, 0.65)",
  accent: "rgb(251, 113, 133)",
  text: "rgb(254, 205, 211)",
};

const FOCUS_RE =
  /\b(typing|laptop|tablet|reading|writing|studying|homework|notes|coding|programm(?:e|ing)|focused|textbook|essay|keyboarding|working at|work on)\b/i;

const STRONG_MOTION_RE = /\b(walking|jogging|running|dancing|pacing|sprinting)\b/i;

const DESK_ANCHOR_RE = /\b(laptop|tablet|typing|desk|computer|keyboard|monitor)\b/i;

/** True when activity reads as desk / deep focus (shows pink in AR overlay). */
export function isLockedInActivity(activity: string): boolean {
  const s = activity.trim().toLowerCase();
  if (!s || s === "detected") return false;
  if (!FOCUS_RE.test(s)) return false;
  if (STRONG_MOTION_RE.test(s) && !DESK_ANCHOR_RE.test(s)) return false;
  return true;
}

const PHONE_RE = /\b(on the phone|phone call|cell phone|smartphone|texting)\b/i;
const SOCIAL_RE = /\b(talking|conversation|chatting|speaking with|discussing with|presenting to)\b/i;
const MOTION_RE = /\b(walking|jogging|running|dancing|pacing|standing up|leaving|entering)\b/i;
const EAT_RE = /\b(eating|drinking|snack|meal|lunch|coffee sip)\b/i;

/** Canvas + UI theme for a labeled activity string. */
export function getActivityLabelTheme(activity: string): LabelRgbTheme {
  const s = activity.trim().toLowerCase();
  if (!s || s === "detected") return EMERALD;

  if (isLockedInActivity(activity)) return PINK_LOCKED;
  if (PHONE_RE.test(s)) return VIOLET_PHONE;
  if (SOCIAL_RE.test(s)) return SKY_SOCIAL;
  if (MOTION_RE.test(s)) return AMBER_MOTION;
  if (EAT_RE.test(s)) return ROSE_EATING;

  return EMERALD;
}

/** Copy for the on-page legend — keep in sync with `getActivityLabelTheme` buckets. */
export type ArLabelLegendRow = {
  id: string;
  /** Tailwind background class for the swatch */
  swatchClass: string;
  title: string;
  description: string;
};

export const AR_LABEL_LEGEND_ROWS: ArLabelLegendRow[] = [
  {
    id: "locked",
    swatchClass: "bg-pink-400",
    title: "Pink",
    description: "Desk / focus (typing, reading, laptop, …)",
  },
  {
    id: "social",
    swatchClass: "bg-sky-400",
    title: "Sky",
    description: "Social (talking, presenting, …)",
  },
  {
    id: "motion",
    swatchClass: "bg-amber-400",
    title: "Amber",
    description: "Motion (walking, entering, …)",
  },
  {
    id: "phone",
    swatchClass: "bg-violet-400",
    title: "Violet",
    description: "Phone / texting",
  },
  {
    id: "eating",
    swatchClass: "bg-rose-400",
    title: "Rose",
    description: "Eating / drinking",
  },
  {
    id: "default",
    swatchClass: "bg-emerald-400",
    title: "Green",
    description: "Other or generic “person”",
  },
];

/** UI-only rows (box outline / pill) while Gemini is pending or failed. */
export const AR_LABEL_LEGEND_PIPELINE_ROWS: ArLabelLegendRow[] = [
  {
    id: "pending",
    swatchClass: "bg-amber-400",
    title: "Amber (pulse)",
    description: "Analyzing…",
  },
  {
    id: "failed",
    swatchClass: "bg-red-400",
    title: "Red",
    description: "Analysis failed",
  },
];
