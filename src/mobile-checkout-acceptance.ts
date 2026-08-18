import type { RecallResponse, WorkState } from "./types.js";

function workStateText(state: WorkState): string {
  return [
    state.intent,
    ...state.explored_directions,
    ...state.rejected_directions,
    state.current_direction,
    state.unresolved_question,
    state.next_experiment
  ].join(" ");
}

function requireSemanticConcept(
  text: string,
  label: string,
  requiredPatterns: RegExp[]
): void {
  if (!requiredPatterns.every((pattern) => pattern.test(text))) {
    throw new Error(`Recall did not semantically recover: ${label}.`);
  }
}

export function assertMobileCheckoutRecall(recall: RecallResponse): void {
  const reconstructed = `${recall.recall} ${workStateText(recall.reconstructedWorkState)}`.toLowerCase();

  requireSemanticConcept(reconstructed, "circular indicators were rejected", [
    /circular|circle/,
    /reject|remove|discard|did not work/,
    /vertical space|vertical room|visual weight|too much space/
  ]);
  requireSemanticConcept(reconstructed, "text-only progress lacked progress awareness", [
    /text[- ]only/,
    /progress/,
    /less visible|not visible|awareness|orientation|immediately visible|harder to see/
  ]);
  requireSemanticConcept(reconstructed, "thin progress bar and compact label direction", [
    /thin progress bar|slim progress bar/,
    /compact (step )?label|step label|step 2 of 3/
  ]);
  requireSemanticConcept(reconstructed, "unresolved progress-versus-clutter frontier", [
    /progress awareness|keep.*oriented|progress.*clear/,
    /visual clutter|clutter/
  ]);
  requireSemanticConcept(reconstructed, "next compact progress experiment", [
    /remove.*(circular|circle)|without.*(circular|circle)/,
    /test|experiment/,
    /progress bar/,
    /step 2 of 3|compact (step )?label|step label/
  ]);
}

export function assertPartialContextIntegrity(context: string): void {
  const forbidden = [
    "circular step",
    "text-only progress",
    "thin progress bar",
    "vertical space",
    "visual weight",
    "step 2 of 3",
    "visual clutter"
  ];
  const lower = context.toLowerCase();
  if (forbidden.some((detail) => lower.includes(detail))) {
    throw new Error("Partial recall context contains a memory-only Mobile Checkout detail.");
  }
}
