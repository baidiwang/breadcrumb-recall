# Breadcrumb Recall

Minimal agentic work-state memory proof for the CockroachDB × AWS Hackathon.

## First gate: real memory smoke test

This test proves the non-mocked path:

```text
structured work state
→ Amazon Bedrock Titan embedding
→ CockroachDB VECTOR(1024)
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
# Authenticate AWS through a profile, SSO session, or environment variables.
npm run smoke
```

Success requires the output to contain:

```text
PASS: partial context retrieved the Night Portrait work frontier.
```

The final JSON includes the CockroachDB version, vector index name, stored vector
dimensions, ranked memories, distances, and fields recovered only from memory.

Never commit database passwords or AWS credentials. See `.env.example` for names only.
