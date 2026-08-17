import { randomUUID } from "node:crypto";
import type pg from "pg";
import { applySchema, checkCockroach, createPool, searchMemories, upsertMemory } from "../db.js";
import { createLocalEmbedder, type Embedder } from "../embedding.js";
import { checkLlm, extractWorkState, reconstructRecall } from "../llm.js";
import { workStateToEmbeddingText } from "../memory-text.js";
import type {
  CaptureRequest,
  CaptureResponse,
  RecallRequest,
  RecallResponse,
  SmokeMemory
} from "../types.js";

let pool: pg.Pool | undefined;
let embedder: Embedder | undefined;
let schemaPromise: Promise<void> | undefined;
let cachedHealth:
  | {
      expiresAt: number;
      value: { cockroach: "ok" | "error"; embedding: "ok" | "error"; llm: "ok" | "error" };
    }
  | undefined;

function dependencies(): { pool: pg.Pool; embedder: Embedder } {
  pool ??= createPool();
  embedder ??= createLocalEmbedder();
  schemaPromise ??= applySchema(pool);
  return { pool, embedder };
}

async function ready(): Promise<{ pool: pg.Pool; embedder: Embedder }> {
  const value = dependencies();
  await schemaPromise;
  return value;
}

export async function captureMemory(input: CaptureRequest): Promise<CaptureResponse> {
  const { pool: database, embedder: localEmbedder } = await ready();
  const workState = await extractWorkState(input.projectId, input.context);
  const embedding = await localEmbedder.embed(workStateToEmbeddingText(workState));
  const memoryId = randomUUID();
  const memory: SmokeMemory = {
    id: memoryId,
    projectId: input.projectId,
    sessionId: `capture-${memoryId}`,
    sourceContext: { context: input.context, capturedAt: new Date().toISOString() },
    workState
  };
  await upsertMemory(database, memory, embedding);
  return { saved: true, memoryId, workState };
}

export async function recallMemory(input: RecallRequest): Promise<RecallResponse> {
  const { pool: database, embedder: localEmbedder } = await ready();
  const queryEmbedding = await localEmbedder.embed(input.context);
  const retrieved = await searchMemories(database, queryEmbedding, 5, input.projectId);
  const reconstruction = await reconstructRecall(input.projectId, input.context, retrieved);
  return {
    recall: reconstruction.recall,
    retrievedMemories: retrieved.map((memory) => ({
      memoryId: memory.id,
      projectId: memory.projectId,
      distance: memory.distance,
      workState: {
        intent: memory.intent,
        explored_directions: memory.exploredDirections,
        rejected_directions: memory.rejectedDirections,
        current_direction: memory.currentDirection,
        unresolved_question: memory.unresolvedQuestion,
        next_experiment: memory.nextExperiment
      }
    })),
    reconstructedWorkState: reconstruction.reconstructedWorkState
  };
}

export async function dependencyHealth(): Promise<{
  cockroach: "ok" | "error";
  embedding: "ok" | "error";
  llm: "ok" | "error";
}> {
  if (cachedHealth && cachedHealth.expiresAt > Date.now()) return cachedHealth.value;
  const health = {
    cockroach: "error" as "ok" | "error",
    embedding: "error" as "ok" | "error",
    llm: "error" as "ok" | "error"
  };
  const { pool: database, embedder: localEmbedder } = dependencies();
  await Promise.all([
    (async () => {
      try {
        await schemaPromise;
        await checkCockroach(database);
        health.cockroach = "ok";
      } catch {}
    })(),
    (async () => {
      try {
        await localEmbedder.embed("Breadcrumb dependency health check.");
        health.embedding = "ok";
      } catch {}
    })(),
    (async () => {
      try {
        await checkLlm();
        health.llm = "ok";
      } catch {}
    })()
  ]);
  cachedHealth = { expiresAt: Date.now() + 60_000, value: health };
  return health;
}

export async function closeApiDependencies(): Promise<void> {
  if (pool) await pool.end();
  pool = undefined;
  schemaPromise = undefined;
  cachedHealth = undefined;
}
