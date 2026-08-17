import type { RetrievedMemory } from "./db.js";
import type { WorkState } from "./types.js";
import { parseJsonObject, validateWorkState } from "./work-state.js";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

type AnthropicResponse = {
  content?: Array<{ type?: string; text?: string }>;
};

type Reconstruction = {
  recall: string;
  reconstructedWorkState: WorkState;
};

function apiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is required for Work-State extraction and recall.");
  return key;
}

async function askAnthropic(system: string, payload: unknown, maxTokens = 1200): Promise<string> {
  // Only the explicitly constructed demo payload is serialized. Environment variables,
  // credentials, and database connection details never enter the request body.
  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": apiKey()
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
      max_tokens: maxTokens,
      temperature: 0,
      system,
      messages: [{ role: "user", content: JSON.stringify(payload) }]
    })
  });
  if (!response.ok) {
    throw new Error(`Anthropic request failed with status ${response.status}.`);
  }
  const body = (await response.json()) as AnthropicResponse;
  const text = body.content?.find((item) => item.type === "text")?.text;
  if (!text) throw new Error("Anthropic returned no text content.");
  return text;
}

export async function extractWorkState(projectId: string, context: string): Promise<WorkState> {
  const text = await askAnthropic(
    `Extract the user's creative work frontier, not a generic summary. Return only JSON with exactly these fields:
intent (string), explored_directions (string[]), rejected_directions (string[]), current_direction (string), unresolved_question (string), next_experiment (string).
Preserve concrete evidence and reasons from the supplied demo context. Do not invent details.`,
    { projectId, context }
  );
  return validateWorkState(parseJsonObject(text));
}

export async function reconstructRecall(
  projectId: string,
  partialContext: string,
  memories: RetrievedMemory[]
): Promise<Reconstruction> {
  if (memories.length === 0) throw new Error("No related memories were found.");
  const memoryEvidence = memories.map((memory) => ({
    memoryId: memory.id,
    intent: memory.intent,
    explored_directions: memory.exploredDirections,
    rejected_directions: memory.rejectedDirections,
    current_direction: memory.currentDirection,
    unresolved_question: memory.unresolvedQuestion,
    next_experiment: memory.nextExperiment
  }));
  const text = await askAnthropic(
    `Reconstruct where the user left off using the retrieved memories as authoritative evidence.
Return only JSON with two fields: recall (a concise welcome-back paragraph containing concrete memory-only details) and reconstructedWorkState.
reconstructedWorkState must contain exactly: intent, explored_directions, rejected_directions, current_direction, unresolved_question, next_experiment.
Do not claim details that are absent from retrievedMemories.`,
    { projectId, partialContext, retrievedMemories: memoryEvidence },
    1600
  );
  const parsed = parseJsonObject(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Recall reconstruction must be a JSON object.");
  }
  const candidate = parsed as Record<string, unknown>;
  if (typeof candidate.recall !== "string" || !candidate.recall.trim()) {
    throw new Error("Recall reconstruction did not include recall text.");
  }
  return {
    recall: candidate.recall,
    reconstructedWorkState: validateWorkState(candidate.reconstructedWorkState)
  };
}

export async function checkLlm(): Promise<void> {
  const text = await askAnthropic(
    "Reply with exactly OK. This is a dependency health check; no user or memory data is included.",
    { healthCheck: true },
    16
  );
  if (text.trim().toUpperCase() !== "OK") throw new Error("Unexpected LLM health response.");
}
