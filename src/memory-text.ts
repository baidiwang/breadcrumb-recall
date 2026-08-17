import type { WorkState } from "./types.js";

export function workStateToEmbeddingText(state: WorkState): string {
  return [
    `Intent: ${state.intent}`,
    `Explored directions: ${state.explored_directions.join("; ")}`,
    `Rejected directions: ${state.rejected_directions.join("; ")}`,
    `Current direction: ${state.current_direction}`,
    `Unresolved question: ${state.unresolved_question}`,
    `Next experiment: ${state.next_experiment}`
  ].join("\n");
}
