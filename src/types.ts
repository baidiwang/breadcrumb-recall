export type WorkState = {
  intent: string;
  explored_directions: string[];
  rejected_directions: string[];
  current_direction: string;
  unresolved_question: string;
  next_experiment: string;
};

export type SmokeMemory = {
  id: string;
  projectId: string;
  sessionId: string;
  sourceContext: Record<string, unknown>;
  workState: WorkState;
};
