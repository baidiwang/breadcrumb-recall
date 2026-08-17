CREATE TABLE IF NOT EXISTS work_states (
  id UUID PRIMARY KEY,
  project_id STRING NOT NULL,
  session_id STRING NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  intent STRING NOT NULL,
  explored_directions JSONB NOT NULL,
  rejected_directions JSONB NOT NULL,
  current_direction STRING NOT NULL,
  unresolved_question STRING NOT NULL,
  next_experiment STRING NOT NULL,
  source_context JSONB NOT NULL,
  embedding VECTOR(384) NOT NULL
);

CREATE INDEX IF NOT EXISTS work_states_project_created_idx
  ON work_states (project_id, created_at DESC);

CREATE VECTOR INDEX IF NOT EXISTS work_states_embedding_idx
  ON work_states (embedding);
