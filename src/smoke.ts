import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { captureMemory, closeApiDependencies, recallMemory } from "./api/service.js";
import { createPool, getDatabaseEvidence } from "./db.js";
import {
  mobileCheckoutCaptureContext,
  mobileCheckoutProjectId,
  partialRecallContext
} from "./fixtures.js";
import {
  assertMobileCheckoutRecall,
  assertPartialContextIntegrity
} from "./mobile-checkout-acceptance.js";

if (existsSync(".env.local")) loadEnvFile(".env.local");
process.env.ALLOWED_PROJECT_IDS = [
  ...(process.env.ALLOWED_PROJECT_IDS ?? "night-portrait").split(","),
  mobileCheckoutProjectId
].join(",");

async function main(): Promise<void> {
  const evidencePool = createPool();
  try {
    assertPartialContextIntegrity(partialRecallContext);
    console.log("[1/5] Extracting Mobile Checkout Work State with Claude...");
    const capture = await captureMemory({
      projectId: mobileCheckoutProjectId,
      context: mobileCheckoutCaptureContext
    });
    console.log(`[2/5] Embedded and stored ${capture.memoryId} in CockroachDB.`);

    const recall = await recallMemory({
      projectId: mobileCheckoutProjectId,
      context: partialRecallContext
    });
    console.log("[3/5] Project-scoped semantic vector search completed.");

    if (!recall.retrievedMemories.some((memory) => memory.memoryId === capture.memoryId)) {
      throw new Error("Recall did not retrieve the Mobile Checkout memory saved by capture.");
    }
    assertMobileCheckoutRecall(recall);
    console.log("[4/5] Recall reconstruction recovered all required semantic facts.");

    const evidence = await getDatabaseEvidence(evidencePool);
    console.log("[5/5] PASS: partial context retrieved the Mobile Checkout work frontier.");
    console.log(
      JSON.stringify(
        {
          passed: true,
          extractedWorkState: capture.workState,
          embedding: {
            provider: "local ONNX via Transformers.js",
            model: "onnx-community/all-MiniLM-L6-v2-ONNX",
            dimensions: 384
          },
          cockroachdb: evidence,
          currentContext: partialRecallContext,
          retrievedMemoryCount: recall.retrievedMemories.length,
          topRelevantMemory: recall.retrievedMemories[0],
          recall: recall.recall,
          recoveredOnlyFromMemory: recall.reconstructedWorkState
        },
        null,
        2
      )
    );
  } finally {
    await Promise.all([evidencePool.end(), closeApiDependencies()]);
  }
}

main().catch((error: unknown) => {
  console.error("\nSMOKE TEST FAILED\n", error);
  process.exitCode = 1;
});
