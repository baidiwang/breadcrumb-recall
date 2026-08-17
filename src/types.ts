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

export type CaptureRequest = {
  projectId: string;
  context: string;
};

export type CaptureResponse = {
  saved: true;
  memoryId: string;
  workState: WorkState;
};

export type RecallRequest = {
  projectId: string;
  context: string;
};

export type RetrievedMemoryEvidence = {
  memoryId: string;
  projectId: string;
  distance: number;
  workState: WorkState;
};

export type RecallResponse = {
  recall: string;
  retrievedMemories: RetrievedMemoryEvidence[];
  reconstructedWorkState: WorkState;
};
