import type { WorkState } from "./types.js";

const fields = [
  "intent",
  "explored_directions",
  "rejected_directions",
  "current_direction",
  "unresolved_question",
  "next_experiment"
] as const;

export function parseJsonObject(text: string): unknown {
  const withoutFence = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("LLM response did not contain a JSON object.");
  return JSON.parse(withoutFence.slice(start, end + 1)) as unknown;
}

export function validateWorkState(value: unknown): WorkState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Work State must be a JSON object.");
  }
  const candidate = value as Record<string, unknown>;
  for (const field of fields) {
    const fieldValue = candidate[field];
    if (field === "explored_directions" || field === "rejected_directions") {
      if (!Array.isArray(fieldValue) || fieldValue.some((item) => typeof item !== "string")) {
        throw new Error(`${field} must be an array of strings.`);
      }
    } else if (typeof fieldValue !== "string" || !fieldValue.trim()) {
      throw new Error(`${field} must be a non-empty string.`);
    }
  }
  return candidate as WorkState;
}
