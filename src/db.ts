import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { EMBEDDING_DIMENSIONS } from "./embedding-config.js";
import type { SmokeMemory } from "./types.js";

const { Pool } = pg;

export type RetrievedMemory = {
  id: string;
  projectId: string;
  intent: string;
  exploredDirections: string[];
  rejectedDirections: string[];
  currentDirection: string;
  unresolvedQuestion: string;
  nextExperiment: string;
  distance: number;
};

export function createPool(): pg.Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required. Export it before running npm run smoke.");
  }
  return new Pool({ connectionString, max: 3, application_name: "breadcrumb-recall" });
}

export async function applySchema(pool: pg.Pool): Promise<void> {
  const schemaUrl = new URL("../sql/001_work_states.sql", import.meta.url);
  const sql = await readFile(fileURLToPath(schemaUrl), "utf8");
  const statements = sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await pool.query(statement);
  }
  await ensureEmbeddingDimensions(pool, EMBEDDING_DIMENSIONS);
}

async function ensureEmbeddingDimensions(pool: pg.Pool, expected: number): Promise<void> {
  const createResult = await pool.query<{ create_statement: string }>(
    "SHOW CREATE TABLE work_states"
  );
  const createStatement = createResult.rows[0]?.create_statement ?? "";
  const match = createStatement.match(/embedding\s+VECTOR\((\d+)\)/i);
  const current = match ? Number(match[1]) : undefined;
  if (current === expected) return;
  if (!current) {
    throw new Error("Could not determine the CockroachDB embedding column dimensions.");
  }

  const countResult = await pool.query<{ count: string }>(
    "SELECT count(*)::STRING AS count FROM work_states"
  );
  const rowCount = Number(countResult.rows[0]?.count ?? "0");
  if (rowCount > 0) {
    throw new Error(
      `Refusing to migrate VECTOR(${current}) to VECTOR(${expected}) with ${rowCount} stored rows.`
    );
  }

  await pool.query("DROP INDEX IF EXISTS work_states@work_states_embedding_idx");
  await pool.query("ALTER TABLE work_states DROP COLUMN embedding");
  await pool.query(
    `ALTER TABLE work_states ADD COLUMN embedding VECTOR(${expected}) NOT NULL`
  );
  await pool.query(
    "CREATE VECTOR INDEX work_states_embedding_idx ON work_states (embedding)"
  );
}

function vectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export async function upsertMemory(
  pool: pg.Pool,
  memory: SmokeMemory,
  embedding: number[]
): Promise<void> {
  await pool.query(
    `INSERT INTO work_states (
       id, project_id, session_id, intent, explored_directions, rejected_directions,
       current_direction, unresolved_question, next_experiment, source_context, embedding
     ) VALUES ($1, $2, $3, $4, $5::JSONB, $6::JSONB, $7, $8, $9, $10::JSONB, $11::VECTOR)
     ON CONFLICT (id) DO UPDATE SET
       project_id = excluded.project_id,
       session_id = excluded.session_id,
       created_at = now(),
       intent = excluded.intent,
       explored_directions = excluded.explored_directions,
       rejected_directions = excluded.rejected_directions,
       current_direction = excluded.current_direction,
       unresolved_question = excluded.unresolved_question,
       next_experiment = excluded.next_experiment,
       source_context = excluded.source_context,
       embedding = excluded.embedding`,
    [
      memory.id,
      memory.projectId,
      memory.sessionId,
      memory.workState.intent,
      JSON.stringify(memory.workState.explored_directions),
      JSON.stringify(memory.workState.rejected_directions),
      memory.workState.current_direction,
      memory.workState.unresolved_question,
      memory.workState.next_experiment,
      JSON.stringify(memory.sourceContext),
      vectorLiteral(embedding)
    ]
  );
}

export async function searchMemories(
  pool: pg.Pool,
  queryEmbedding: number[],
  limit = 3,
  projectId?: string
): Promise<RetrievedMemory[]> {
  const result = await pool.query<{
    id: string;
    project_id: string;
    intent: string;
    explored_directions: string[];
    rejected_directions: string[];
    current_direction: string;
    unresolved_question: string;
    next_experiment: string;
    distance: string;
  }>(projectId ?
    `SELECT
       id::STRING,
       project_id,
       intent,
       explored_directions,
       rejected_directions,
       current_direction,
       unresolved_question,
       next_experiment,
       embedding <-> $1::VECTOR AS distance
     FROM work_states
     WHERE project_id = $2
     ORDER BY embedding <-> $1::VECTOR, created_at DESC
     LIMIT $3` :
    `SELECT
       id::STRING,
       project_id,
       intent,
       explored_directions,
       rejected_directions,
       current_direction,
       unresolved_question,
       next_experiment,
       embedding <-> $1::VECTOR AS distance
     FROM work_states
     ORDER BY embedding <-> $1::VECTOR, created_at DESC
     LIMIT $2`,
    projectId
      ? [vectorLiteral(queryEmbedding), projectId, limit]
      : [vectorLiteral(queryEmbedding), limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    intent: row.intent,
    exploredDirections: row.explored_directions,
    rejectedDirections: row.rejected_directions,
    currentDirection: row.current_direction,
    unresolvedQuestion: row.unresolved_question,
    nextExperiment: row.next_experiment,
    distance: Number(row.distance)
  }));
}

export async function checkCockroach(pool: pg.Pool): Promise<void> {
  await pool.query("SELECT 1");
}

export async function getDatabaseEvidence(pool: pg.Pool): Promise<{
  version: string;
  vectorIndex: string;
  storedVectorDimensions: number;
}> {
  const versionResult = await pool.query<{ version: string }>("SELECT version()");
  const indexResult = await pool.query<{ index_name: string }>(
    `SELECT index_name
     FROM [SHOW INDEXES FROM work_states]
     WHERE index_name = 'work_states_embedding_idx'
     LIMIT 1`
  );
  const vectorResult = await pool.query<{ embedding_text: string }>(
    `SELECT embedding::STRING AS embedding_text
     FROM work_states
     LIMIT 1`
  );

  const version = versionResult.rows[0]?.version;
  const vectorIndex = indexResult.rows[0]?.index_name;
  const storedVector = vectorResult.rows[0]?.embedding_text;
  const parsedVector = storedVector ? (JSON.parse(storedVector) as unknown) : undefined;
  const storedVectorDimensions = Array.isArray(parsedVector) ? parsedVector.length : 0;
  if (!version || !vectorIndex || !storedVectorDimensions) {
    throw new Error("CockroachDB evidence check failed: version, vector index, or vector row missing.");
  }
  return { version, vectorIndex, storedVectorDimensions };
}
