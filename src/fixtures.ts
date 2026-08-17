import type { SmokeMemory } from "./types.js";

export const partialRecallContext =
  "Night portrait study. Keep the environment cool without losing warm skin tones.";

export const smokeMemories: SmokeMemory[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    projectId: "night-portrait",
    sessionId: "fixture-night-portrait-01",
    sourceContext: {
      artwork: "night-portrait",
      recentActivity: [
        "Compared three background color directions.",
        "Checked how each direction affected the subject's skin tones."
      ],
      interruptedAt: "2026-08-16T21:15:00.000Z"
    },
    workState: {
      intent: "Create a warm character against a cool nighttime environment.",
      explored_directions: [
        "warm yellow background",
        "deep blue background",
        "muted blue-violet"
      ],
      rejected_directions: [
        "warm yellow competed with the subject",
        "deep blue made skin tones feel muddy"
      ],
      current_direction: "muted blue-violet",
      unresolved_question:
        "How can the environment remain cool without making the skin feel muddy?",
      next_experiment:
        "Reduce background saturation while preserving warm highlights around the subject."
    }
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    projectId: "bakery-wordmark",
    sessionId: "fixture-bakery-wordmark-01",
    sourceContext: { artwork: "bakery-wordmark", interruptedAt: "2026-08-15T18:10:00.000Z" },
    workState: {
      intent: "Create a friendly wordmark for a neighborhood bakery.",
      explored_directions: ["rounded serif", "hand-lettered script", "geometric sans"],
      rejected_directions: ["the script was difficult to read at small sizes"],
      current_direction: "rounded serif",
      unresolved_question: "How much irregularity can the letters carry while staying legible?",
      next_experiment: "Redraw the lowercase a and test the mark at favicon size."
    }
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    projectId: "coastal-landscape",
    sessionId: "fixture-coastal-landscape-01",
    sourceContext: { artwork: "coastal-landscape", interruptedAt: "2026-08-14T16:40:00.000Z" },
    workState: {
      intent: "Paint a quiet coastal landscape with a strong sense of distance.",
      explored_directions: ["high horizon", "low horizon", "fog-softened cliffs"],
      rejected_directions: ["the high horizon made the composition feel crowded"],
      current_direction: "low horizon with softened cliffs",
      unresolved_question: "How can the foreground add depth without becoming the focal point?",
      next_experiment: "Add two low-contrast foreground shapes and reduce their edge detail."
    }
  }
];
