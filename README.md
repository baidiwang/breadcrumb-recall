# Breadcrumb Recall

Minimal agentic work-state memory proof for the CockroachDB × AWS Hackathon.

## First gate: real memory smoke test

This test proves the non-mocked path:

```text
structured work state
→ local quantized all-MiniLM-L6-v2 embedding
→ CockroachDB VECTOR(384)
→ CockroachDB distributed vector index
→ semantic retrieval from intentionally incomplete context
```

The fixture supplies the initial creative context. Embedding, persistence, indexing,
and retrieval are real. The incomplete recall query omits the rejected directions,
current direction, unresolved question, and next experiment.

### Run

```bash
npm install
# Create an ignored .env.local from .env.example and set DATABASE_URL.
npm run smoke
```

Success requires the output to contain:

```text
PASS: partial context retrieved the Night Portrait work frontier.
```

The final JSON includes the CockroachDB version, vector index name, stored vector
dimensions, ranked memories, distances, and fields recovered only from memory.

The embedding model runs locally through Transformers.js and ONNX. The first run
downloads the quantized model into `.cache/transformers`; later runs use the local
cache and require no embedding API account.

Never commit database passwords or AWS credentials. See `.env.example` for names only.

## Web Demo API

The backend exposes the three integration points needed by the approved Lovable UI:

```text
POST /api/capture  → extract Work State → MiniLM 384d → CockroachDB
POST /api/recall   → MiniLM 384d → CockroachDB vector search → LLM reconstruction
GET  /api/health   → CockroachDB, local embedding, and LLM dependency status
```

Set `DATABASE_URL` and `ANTHROPIC_API_KEY` in the ignored `.env.local`. Set
`CORS_ORIGIN` to the exact Web Demo origin. Anthropic receives only the supplied demo
context and the Work States retrieved for reconstruction; secrets, environment
variables, and database connection details are never included in the request body.

Run the local API:

```bash
npm run api:dev
```

Capture the pre-seeded project context:

```bash
curl -X POST http://localhost:8787/api/capture \
  -H 'content-type: application/json' \
  -d '{"projectId":"night-portrait","context":"Project: Night Portrait. The artwork shows a warmly lit character against a cool nighttime environment. Warm yellow competed with the subject; deep blue made skin tones muddy. Muted blue-violet is the current direction. The unresolved question is how to keep the environment cool without muddy skin. Next, reduce background saturation while preserving warm highlights."}'
```

Recall with intentionally incomplete context:

```bash
curl -X POST http://localhost:8787/api/recall \
  -H 'content-type: application/json' \
  -d '{"projectId":"night-portrait","context":"Night portrait study. Keep the environment cool without losing warm skin tones."}'
```

The recall request deliberately omits all prior explored and rejected directions. The
response includes `retrievedMemories` so the UI can show direct CockroachDB evidence.

Run the full HTTP integration proof:

```bash
npm run api:smoke
```

Success ends with:

```text
PASS: partial context retrieved the Night Portrait work frontier.
```

### Frontend integration

The existing Web Demo only needs to replace its mock calls:

```ts
const capture = await fetch(`${API_URL}/api/capture`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ projectId: "night-portrait", context: preseededContext })
}).then((response) => response.json());

const recall = await fetch(`${API_URL}/api/recall`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ projectId: "night-portrait", context: partialContext })
}).then((response) => response.json());
```

Use `capture.workState`, `recall.reconstructedWorkState`, and
`recall.retrievedMemories`; no visual changes are required.

## CockroachDB Cloud Managed MCP inspection

The production Recall path continues to use the application database connection and
CockroachDB vector search directly. Managed MCP is a separate, read-only inspection
path for an operator or agent to examine the same persistent Work-State memory. It is
not in the user-request path.

This repository includes a project-scoped [`.mcp.json`](.mcp.json) configured for the
same CockroachDB Cloud cluster. The cluster ID is an identifier, not a credential;
authentication is completed with CockroachDB Cloud OAuth and no OAuth token is stored
in the repository.

To reproduce with Claude Code:

```bash
claude mcp add cockroachdb-cloud https://cockroachlabs.cloud/mcp \
  --scope project \
  --transport http \
  --header "mcp-cluster-id: 154e9b66-e34c-4fb6-937c-6c0764931d2c"
claude
```

Inside Claude Code, open `/mcp`, authenticate with CockroachDB Cloud, and grant
**Read Data** only. Then use this inspection prompt:

```text
Using only the cockroachdb-cloud MCP server and read-only select_query, run exactly
this SQL against defaultdb:

SELECT id::STRING AS memory_id, created_at, intent, current_direction,
       unresolved_question, next_experiment
FROM public.work_states
WHERE project_id = 'night-portrait'
ORDER BY created_at DESC
LIMIT 1;

Return every field exactly as the MCP tool returned it. Do not modify data.
```

Verified on 2026-08-17 through Managed MCP `select_query` (one read, no writes):

```json
{
  "rows": [
    {
      "memory_id": "9fb83770-3589-4e9c-97fd-d43d4dbe3574",
      "created_at": "2026-08-17T23:50:31.066165Z",
      "intent": "Create a night portrait where the character feels warm and inviting while maintaining a cool nighttime environment without muddying skin tones",
      "current_direction": "Muted blue-violet background with reduced saturation while preserving warm highlights",
      "unresolved_question": "How to maintain cool nighttime environment without the background colors desaturating or cooling the skin tones to the point of muddiness",
      "next_experiment": "Reduce background saturation while preserving warm highlights on the character to create separation between cool environment and warm subject"
    }
  ]
}
```

This is the stored frontier inspected from the same `work_states` table used by the
production capture and semantic-recall endpoints. See the official
[CockroachDB Cloud MCP documentation](https://www.cockroachlabs.com/docs/cockroachcloud/connect-to-the-cockroachdb-cloud-mcp-server)
for supported clients, OAuth, and tool permissions.

## AWS Lambda preparation

`Dockerfile.lambda` packages the same quantized MiniLM model into a Lambda container
image. The model is downloaded at image-build time and remote model downloads are
disabled at runtime. This preserves the verified local embedding architecture and
avoids a separate embedding service.

The Lambda export is `dist/api/lambda.handler` and supports a Lambda Function URL
directly; API Gateway, ECS, and authentication infrastructure are not required for
this fixed hackathon demo. Configure these Lambda environment variables through the
AWS console or your secure deployment environment:

```text
DATABASE_URL
ANTHROPIC_API_KEY
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
CORS_ORIGIN=https://your-approved-demo.example
ALLOWED_PROJECT_IDS=night-portrait
```

Build and test the image locally before publishing it to ECR:

```bash
docker build -f Dockerfile.lambda -t breadcrumb-recall-lambda .
```

Create the Function URL with `NONE` auth only for the public hackathon demo, restrict
CORS to the exact Lovable origin, and set a low Lambda reserved-concurrency value (for
example, 2) to limit accidental spend. Start with a 30-second timeout and 2048 MB of
memory to leave room for MiniLM cold starts. The application also limits request size,
only accepts the configured demo project, and caches dependency health for 60 seconds.
