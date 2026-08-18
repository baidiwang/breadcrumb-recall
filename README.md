# Breadcrumb: Continuity for Unfinished Work

Breadcrumb preserves the **Work State** required to continue unfinished work—not merely a log of
past activity. It remembers the intent, alternatives explored, rejected directions, current
direction, unresolved question, and next experiment that define where work actually stopped.

This repository contains the backend and persistent-memory implementation built for the
CockroachDB × AWS Hackathon. The public web demo uses a representative **Mobile Checkout
Redesign** scenario to show the complete capture-and-recall loop.

- **Production demo:** [https://breadcrumb-recall.vercel.app](https://breadcrumb-recall.vercel.app/)
- **Backend repository (this repo):** [baidiwang/breadcrumb-recall](https://github.com/baidiwang/breadcrumb-recall)
- **Web demo source:** [baidiwang/breadcrumb-recall-web](https://github.com/baidiwang/breadcrumb-recall-web)
- **Production API health:** [AWS Lambda Function URL](https://gvzzvmmdaqzhynsm5dwy45iqxi0glflr.lambda-url.us-east-1.on.aws/api/health)

## Demo

The production demo tells one focused story:

1. A representative Mobile Checkout product-design workspace is already open.
2. Breadcrumb notices a simulated interruption.
3. The user selects **Remember this**.
4. Claude extracts a structured Work State from the pre-seeded work context.
5. The user selects **Leave & come back later**.
6. The workspace returns **2 days later…**.
7. The returning session supplies only partial current context.
8. Breadcrumb retrieves persistent memories and reconstructs where the work stopped.
9. **Why this recall?** displays the real retrieved memory IDs, vector distances, and recovered
   evidence returned by the backend.

The checkout canvas is a deterministic, representative product-design workspace created for the
hackathon demonstration. It is not a Figma plugin or a live Figma integration. The scenario is
pre-seeded, but Work-State extraction, embedding, CockroachDB persistence, vector retrieval, and
Recall reconstruction all use the real production pipeline. The frontend does not contain a
mocked success response.

## What Breadcrumb remembers

Each stored Work State has this schema:

```text
intent
explored_directions
rejected_directions
current_direction
unresolved_question
next_experiment
```

The unresolved question is the important frontier: it captures the decision that was still open
when the user left.

In the Mobile Checkout scenario, the initial context describes circular step indicators,
text-only progress, and a thin progress bar with a compact step label. The returning request is
deliberately limited to:

```text
Continue simplifying the mobile checkout header while keeping progress clear.
```

That request contains none of the prior alternatives, rejection reasons, current direction, open
question, or next experiment. Those details must come from CockroachDB memory.

## Production architecture

```mermaid
flowchart LR
    U["Browser"] --> F["Lovable-generated frontend<br/>Vercel"]
    F -->|"direct HTTPS<br/>capture / recall / health"| L["AWS Lambda Function URL<br/>container runtime"]
    L --> C["Anthropic Claude Haiku 4.5<br/>Work-State extraction + Recall"]
    L --> E["Quantized all-MiniLM-L6-v2<br/>Transformers.js / ONNX, 384d"]
    L --> D["CockroachDB<br/>structured Work States + VECTOR(384)"]
    E --> D
    D -->|"distributed vector search"| L
    M["CockroachDB Cloud Managed MCP<br/>OAuth, read-only inspection"] -.-> D
```

### Frontend

- Lovable-generated React/TanStack Start frontend.
- Source repository:
  [https://github.com/baidiwang/breadcrumb-recall-web](https://github.com/baidiwang/breadcrumb-recall-web)
- Production integration branch:
  [`codex/lovable-mobile-production`](https://github.com/baidiwang/breadcrumb-recall-web/tree/codex/lovable-mobile-production)
- Production integration commit: `837196eb213fe0bf0f72f35aa3f3874dfc77bd8f`
- Hosted on Vercel at
  [https://breadcrumb-recall.vercel.app](https://breadcrumb-recall.vercel.app/).
- Calls the AWS Lambda Function URL directly from the browser. There is no frontend server proxy
  in the production path.

### Backend and agent runtime

- This repository contains the API, Work-State agent logic, embedding runtime, schema, and smoke
  tests.
- Production runs as an AWS Lambda container image through a Lambda Function URL.
- Production Lambda package type: `Image`; architecture: `x86_64`; memory: 512 MB; timeout: 30
  seconds.
- The Function URL uses `AuthType: NONE` for the public hackathon demo.
- CORS is enforced by the application with an explicit origin allowlist. The current production
  origins are `https://breadcrumb-recall.vercel.app` and
  `https://breadcrumb-recall.lovable.app`; wildcard CORS is not used.
- Current demo projects are explicitly scoped as `mobile-checkout-redesign` and the retained
  historical `night-portrait` project. Vector retrieval includes `WHERE project_id = ...`, so the
  two projects do not share Recall results.

### AI and embeddings

- Work-State extraction and Recall reconstruction use Anthropic Claude Haiku 4.5.
- Verified production model ID: `claude-haiku-4-5-20251001`.
- Embeddings use the q4-quantized
  `onnx-community/all-MiniLM-L6-v2-ONNX` model through Transformers.js.
- Embeddings are 384-dimensional, mean-pooled, normalized, and generated locally inside the
  backend/Lambda. No external embedding account or separate vector store is required.
- The Lambda image downloads the model at build time and runs with
  `EMBEDDING_LOCAL_ONLY=true`.

### Persistent memory

- CockroachDB is the system of record for structured Work States and their embeddings.
- The schema stores `work_states.embedding VECTOR(384)` alongside transactional Work-State
  fields.
- Semantic retrieval uses CockroachDB's distributed vector index
  `work_states_embedding_idx`.
- CockroachDB Cloud Managed MCP provides a separate OAuth-authenticated, read-only inspection path
  over the same `work_states` table. MCP is not in the end-user Capture or Recall request path.

## End-to-end memory flow

Capture:

```text
Work Context
→ Claude Work-State extraction
→ local MiniLM 384d embedding
→ CockroachDB Work-State persistence
```

Recall:

```text
Partial Current Context
→ local MiniLM 384d embedding
→ project-scoped CockroachDB vector search
→ Retrieved Work States
→ Claude reconstruction
→ Resume recommendation
```

The frontend renders the Work State returned by Capture and the Recall reconstructed from
retrieved memory. It does not hardcode the successful Work State, the number of memories, vector
distances, or recovered historical details.

## CockroachDB integration

### Distributed Vector Indexing

The schema is defined in [`sql/001_work_states.sql`](sql/001_work_states.sql):

```sql
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

CREATE VECTOR INDEX IF NOT EXISTS work_states_embedding_idx
  ON work_states (embedding);
```

Capture inserts the structured Work State and embedding in one record. Recall embeds the partial
context and ranks memories with CockroachDB's vector-distance operator:

```sql
SELECT ..., embedding <-> $1::VECTOR AS distance
FROM work_states
WHERE project_id = $2
ORDER BY embedding <-> $1::VECTOR, created_at DESC
LIMIT $3;
```

This keeps operational state and semantic memory consistent in one database.

### CockroachDB Cloud Managed MCP Server

Managed MCP is used for controlled inspection of the same persistent memory used by production
Recall. The checked-in [`.mcp.json`](.mcp.json) points to
`https://cockroachlabs.cloud/mcp` and includes only the CockroachDB cluster identifier; the
identifier is not a credential.

Authentication uses CockroachDB Cloud OAuth. No OAuth token is stored in this repository. Grant
**Read Data** only so inspection is read-only.

To reproduce the project-scoped configuration with Claude Code:

```bash
claude mcp add cockroachdb-cloud https://cockroachlabs.cloud/mcp \
  --scope project \
  --transport http \
  --header "mcp-cluster-id: 154e9b66-e34c-4fb6-937c-6c0764931d2c"
claude
```

Then open `/mcp`, complete CockroachDB Cloud OAuth, approve **Read Data** only, and use this
inspection request:

```text
Using only the cockroachdb-cloud MCP server and read-only select_query, run exactly
this SQL against defaultdb:

SELECT id::STRING AS memory_id, created_at, intent, current_direction,
       unresolved_question, next_experiment
FROM public.work_states
WHERE project_id = 'mobile-checkout-redesign'
ORDER BY created_at DESC
LIMIT 1;

Return every field exactly as the MCP tool returned it. Do not modify data.
```

This workflow was verified with Managed MCP `select_query` against the production
`public.work_states` table using read-only access. Query output is intentionally not hardcoded in
the README because it changes whenever a new real Capture is performed.

CockroachDB documentation:
[Connect to the CockroachDB Cloud MCP server](https://www.cockroachlabs.com/docs/cockroachcloud/connect-to-the-cockroachdb-cloud-mcp-server).

## AWS Lambda

AWS Lambda is the production agent runtime. The public Function URL is:

```text
https://gvzzvmmdaqzhynsm5dwy45iqxi0glflr.lambda-url.us-east-1.on.aws/
```

The Function URL invokes `dist/api/lambda.handler`. [`Dockerfile.lambda`](Dockerfile.lambda)
builds on the AWS Lambda Node.js 22 base image, compiles the TypeScript backend, downloads the
quantized MiniLM model into `/opt/model-cache`, removes development dependencies, and copies the
compiled handler, SQL schema, dependencies, and model cache into the runtime image.

Build the same container locally when Docker is available:

```bash
docker build -f Dockerfile.lambda -t breadcrumb-recall-lambda .
```

The repository supplies the container build and Lambda adapter but does not contain
infrastructure-as-code for provisioning an AWS account, ECR repository, or Function URL. Publish
the image and configure Lambda through your own authorized AWS deployment workflow; do not commit
deployment credentials.

Production configuration is supplied as Lambda environment variables. Bedrock is **not** in the
critical production path, and Amazon Titan is not the production embedding provider. Titan access
was attempted during development but was blocked by new-account Bedrock authorization, so the
final implementation uses local MiniLM embeddings.

## Installation

### Prerequisites

- Node.js 22 and npm.
- A CockroachDB connection string for a database where the account can create the documented table
  and indexes.
- An Anthropic API key with access to the configured Claude model.

Clone and install:

```bash
git clone https://github.com/baidiwang/breadcrumb-recall.git
cd breadcrumb-recall
npm ci
cp .env.example .env.local
```

Edit the ignored `.env.local` with local values. Never place real credentials in `.env.example`.

| Variable | Required locally | Purpose | Placeholder/example |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL-compatible CockroachDB connection string used for schema setup, persistence, and retrieval. | `postgresql://username:password@host:26257/defaultdb?sslmode=verify-full` |
| `ANTHROPIC_API_KEY` | Yes | Server-side Claude authentication for extraction, reconstruction, and LLM health checks. | `replace-with-anthropic-api-key` |
| `ANTHROPIC_MODEL` | No | Overrides the Claude model. Defaults to the verified production model. | `claude-haiku-4-5-20251001` |
| `EMBEDDING_CACHE_DIR` | No | Local Transformers.js model cache. | `.cache/transformers` |
| `EMBEDDING_LOCAL_ONLY` | No | Disables remote model downloads. Set to `true` only after the model cache is populated; the Lambda image does this at build time. | `false` locally / `true` in Lambda |
| `CORS_ORIGIN` | No for command-line smoke tests; required for browser deployment | Comma-separated exact browser origins accepted by the API. Defaults to `http://localhost:5173`. | `http://localhost:5173` |
| `ALLOWED_PROJECT_IDS` | No | Comma-separated demo project allowlist. The code defaults to both retained demo IDs. | `night-portrait,mobile-checkout-redesign` |
| `PORT` | No | Local HTTP API port. | `8787` |

The first local embedding run downloads the q4 ONNX model to `.cache/transformers`; later runs use
the cache. The API automatically applies the idempotent schema in
[`sql/001_work_states.sql`](sql/001_work_states.sql) before handling memory operations.

## Local development and testing

Typecheck and build:

```bash
npm run typecheck
npm run build
```

Run the real service-level memory proof:

```bash
npm run smoke
```

Run the same Capture → Recall proof through the local HTTP adapter:

```bash
npm run api:smoke
```

Both smoke tests call Claude, generate local MiniLM embeddings, write a new Work State to
CockroachDB, perform project-scoped vector retrieval, and assert that the newly captured memory is
returned. They are integration tests, not offline unit tests, and may incur Anthropic and
CockroachDB usage.

Run the local backend:

```bash
npm run api:dev
# http://localhost:8787
```

Check dependencies:

```bash
curl http://localhost:8787/api/health
```

This backend repository does not contain the frontend toolchain. To inspect the production web
source separately:

```bash
git clone https://github.com/baidiwang/breadcrumb-recall-web.git
cd breadcrumb-recall-web
git checkout codex/lovable-mobile-production
npm ci
npm run dev
```

The production frontend has the Lambda URL compiled into its direct API client. Its full API flow
is intended to run at the explicitly allowed production origin; an unapproved localhost origin is
rejected by production CORS.

## API

Local base URL: `http://localhost:8787`

Production base URL:
`https://gvzzvmmdaqzhynsm5dwy45iqxi0glflr.lambda-url.us-east-1.on.aws`

### `GET /api/health`

Checks CockroachDB connectivity, one local embedding, and a minimal Claude response. Dependency
results are cached for 60 seconds.

Response (`200` when all dependencies are healthy, otherwise `503`):

```json
{
  "cockroach": "ok",
  "embedding": "ok",
  "llm": "ok"
}
```

### `POST /api/capture`

Extracts, embeds, and persists a Work State.

Required JSON fields:

- `projectId`: non-empty string included in `ALLOWED_PROJECT_IDS`.
- `context`: non-empty source context, at most 20,000 characters.

Example request:

```json
{
  "projectId": "mobile-checkout-redesign",
  "context": "Mobile Checkout Redesign. Simplify the mobile checkout header while keeping shoppers oriented. Circular step indicators use too much vertical space and add visual weight. Text-only progress is cleaner but makes progress less immediately visible. Test a thin progress bar with a compact step label."
}
```

Response structure:

```ts
type CaptureResponse = {
  saved: true;
  memoryId: string;
  workState: WorkState;
};

type WorkState = {
  intent: string;
  explored_directions: string[];
  rejected_directions: string[];
  current_direction: string;
  unresolved_question: string;
  next_experiment: string;
};
```

The Work State is Claude output validated by the backend, not a fixture-shaped success response.

### `POST /api/recall`

Embeds the partial current context, retrieves up to five project-scoped Work States, and asks
Claude to reconstruct the work frontier using those memories as authoritative evidence.

Required JSON fields are the same as Capture. The production demo request is intentionally only:

```json
{
  "projectId": "mobile-checkout-redesign",
  "context": "Continue simplifying the mobile checkout header while keeping progress clear."
}
```

Response structure:

```ts
type RecallResponse = {
  recall: string;
  retrievedMemories: Array<{
    memoryId: string;
    projectId: string;
    distance: number;
    workState: WorkState;
  }>;
  reconstructedWorkState: WorkState;
};
```

`distance` is the real value returned by CockroachDB. The frontend displays it as distance and
does not fabricate a similarity score.

## Web Demo

Frontend source:
[https://github.com/baidiwang/breadcrumb-recall-web](https://github.com/baidiwang/breadcrumb-recall-web)

Production:
[https://breadcrumb-recall.vercel.app](https://breadcrumb-recall.vercel.app/)

The frontend calls the production AWS Lambda backend directly from the browser. Capture renders
the returned Work State. Recall renders the returned reconstruction and the actual count and
evidence from `retrievedMemories`. If the backend fails, the UI displays an error rather than a
mocked success state.

## Verified result

The real smoke test must end with:

```text
PASS: partial context retrieved the Mobile Checkout work frontier.
```

This proves that:

- the partial returning context does not contain the historical design decisions;
- Claude extracts a structured Work State from the initial context;
- MiniLM produces a real 384-dimensional embedding;
- CockroachDB persists and semantically retrieves the memory under the correct project scope;
- the newly saved memory is present in the retrieval results; and
- Claude reconstructs the rejected directions, current direction, unresolved question, and next
  experiment from retrieved persistent memory.

## Project lineage and pre-existing work

The original [Breadcrumb prototype](https://github.com/baidiwang/breadcrumb) predates this
hackathon. It established the desktop-companion concept, toaster character, interruption-oriented
product direction, and visual language.

This repository is a separate hackathon implementation of persistent Agentic Work-State Memory,
including the CockroachDB schema and vector retrieval, Claude extraction and reconstruction,
local MiniLM embeddings, Lambda API/runtime, MCP inspection workflow, and end-to-end validation.
The original Breadcrumb repository was kept separate and was not modified as part of this
submission. This project builds on its product concept; it does not claim that every aspect of the
broader Breadcrumb idea was invented during the hackathon.

## Security

- No secrets, database URLs, API keys, AWS credentials, private keys, or MCP OAuth tokens are
  committed.
- `.env` and `.env.*` are ignored, except for the placeholder-only `.env.example`; `.env.local` is
  therefore ignored.
- Model caches, build output, credentials files, `.aws/`, PEM files, and key files are ignored.
- `DATABASE_URL` and `ANTHROPIC_API_KEY` exist only in local or Lambda environment variables.
- The frontend receives no database, Anthropic, AWS, or MCP credential. It contains only the
  public Lambda Function URL, which is an endpoint rather than a secret.
- The Managed MCP OAuth token is held by the MCP client and is never stored in this repository.
- The production Function URL intentionally uses no AWS IAM authentication for the public demo;
  the API restricts browser origins, accepted project IDs, and request sizes. CORS is a browser
  control, not a substitute for authentication in a production multi-user service.

## Limitations and demo scope

- Mobile Checkout is a deterministic, representative design-work scenario.
- This is not a Figma plugin and does not monitor a real Figma document.
- The demo does not monitor other browser tabs or applications.
- Desktop cross-application capture from the original Breadcrumb concept remains future product
  work.
- The hackathon implementation intentionally focuses on the complete
  Context → Work State → Persistent Memory → Semantic Recall → Resume loop.
- The public Function URL and fixed project allowlist are suitable for a time-bounded hackathon
  demo, not a production multi-user authentication model.

## License

This project is available under the [MIT License](LICENSE).
