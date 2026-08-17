import { captureMemory, dependencyHealth, recallMemory } from "./service.js";
import type { CaptureRequest, RecallRequest } from "../types.js";

export type ApiResult = {
  status: number;
  headers: Record<string, string>;
  body: unknown;
};

const MAX_CONTEXT_LENGTH = 20_000;
const FORBIDDEN_RECALL_DETAILS = ["warm yellow", "deep blue", "muddy", "muted blue-violet"];

class InputError extends Error {}

function allowedOrigin(): string {
  return process.env.CORS_ORIGIN ?? "http://localhost:5173";
}

function allowedProjectIds(): Set<string> {
  return new Set((process.env.ALLOWED_PROJECT_IDS ?? "night-portrait").split(",").map((id) => id.trim()));
}

function responseHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": allowedOrigin(),
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "content-type": "application/json; charset=utf-8",
    vary: "origin"
  };
}

function parseInput(body: unknown): CaptureRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new InputError("Request body must be a JSON object.");
  }
  const candidate = body as Record<string, unknown>;
  if (typeof candidate.projectId !== "string" || !candidate.projectId.trim()) {
    throw new InputError("projectId is required.");
  }
  const projectId = candidate.projectId.trim();
  if (!allowedProjectIds().has(projectId)) throw new InputError("Unknown demo project.");
  if (typeof candidate.context !== "string" || !candidate.context.trim()) {
    throw new InputError("context is required.");
  }
  if (candidate.context.length > MAX_CONTEXT_LENGTH) {
    throw new InputError(`context must be at most ${MAX_CONTEXT_LENGTH} characters.`);
  }
  return { projectId, context: candidate.context.trim() };
}

export async function routeApi(
  method: string,
  path: string,
  body?: unknown,
  requestOrigin?: string
): Promise<ApiResult> {
  const headers = responseHeaders();
  if (requestOrigin && requestOrigin !== allowedOrigin()) {
    return { status: 403, headers, body: { error: "Origin not allowed." } };
  }
  if (method === "OPTIONS") return { status: 204, headers, body: null };
  try {
    if (method === "POST" && path === "/api/capture") {
      return { status: 200, headers, body: await captureMemory(parseInput(body)) };
    }
    if (method === "POST" && path === "/api/recall") {
      const input = parseInput(body) as RecallRequest;
      const lowerContext = input.context.toLowerCase();
      if (FORBIDDEN_RECALL_DETAILS.some((detail) => lowerContext.includes(detail))) {
        throw new InputError(
          "Recall context contains details that must be recovered from persistent memory."
        );
      }
      return { status: 200, headers, body: await recallMemory(input) };
    }
    if (method === "GET" && path === "/api/health") {
      const health = await dependencyHealth();
      const healthy = Object.values(health).every((status) => status === "ok");
      return { status: healthy ? 200 : 503, headers, body: health };
    }
    return { status: 404, headers, body: { error: "Not found." } };
  } catch (error) {
    if (error instanceof InputError) {
      return { status: 400, headers, body: { error: error.message } };
    }
    console.error("API request failed. See dependency health for component status.");
    return { status: 500, headers, body: { error: "Request failed." } };
  }
}
