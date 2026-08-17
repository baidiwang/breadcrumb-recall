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
CORS to the exact Vercel origin, and set a low Lambda reserved-concurrency value (for
example, 2) to limit accidental spend. Start with a 30-second timeout and 2048 MB of
memory to leave room for MiniLM cold starts. The application also limits request size,
only accepts the configured demo project, and caches dependency health for 60 seconds.
