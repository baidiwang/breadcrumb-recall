import { createPool, applySchema, getDatabaseEvidence, searchMemories, upsertMemory } from "./db.js";
import { createBedrockEmbedder } from "./embedding.js";
import { partialRecallContext, smokeMemories } from "./fixtures.js";
import { workStateToEmbeddingText } from "./memory-text.js";

async function main(): Promise<void> {
  const embedder = createBedrockEmbedder();
  const pool = createPool();

  try {
    console.log("[1/5] Connected configuration loaded.");
    await applySchema(pool);
    console.log("[2/5] CockroachDB schema and distributed vector index are ready.");

    for (const memory of smokeMemories) {
      const embedding = await embedder.embed(workStateToEmbeddingText(memory.workState));
      await upsertMemory(pool, memory, embedding);
      console.log(`[3/5] Embedded and stored: ${memory.projectId} (${embedding.length} dimensions).`);
    }

    const queryEmbedding = await embedder.embed(partialRecallContext);
    const retrievedMemories = await searchMemories(pool, queryEmbedding, smokeMemories.length);
    console.log("[4/5] Semantic vector search completed.");

    const evidence = await getDatabaseEvidence(pool);
    const top = retrievedMemories[0];
    if (top?.projectId !== "night-portrait") {
      throw new Error(`Semantic retrieval assertion failed. Expected night-portrait, got ${top?.projectId}.`);
    }

    const forbiddenQueryDetails = ["warm yellow", "deep blue", "muddy", "muted blue-violet"];
    if (forbiddenQueryDetails.some((detail) => partialRecallContext.toLowerCase().includes(detail))) {
      throw new Error("Partial recall context accidentally contains details that must come from memory.");
    }

    console.log("[5/5] PASS: partial context retrieved the Night Portrait work frontier.");
    console.log(
      JSON.stringify(
        {
          passed: true,
          embedding: { provider: "Amazon Bedrock", model: embedder.modelId, dimensions: embedder.dimensions },
          cockroachdb: evidence,
          currentContext: partialRecallContext,
          retrievedMemories,
          proof: {
            recoveredOnlyFromMemory: {
              rejectedDirections: top.rejectedDirections,
              currentDirection: top.currentDirection,
              unresolvedQuestion: top.unresolvedQuestion,
              nextExperiment: top.nextExperiment
            }
          }
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("\nSMOKE TEST FAILED\n", error);
  process.exitCode = 1;
});
