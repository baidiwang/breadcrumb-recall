import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import type { AddressInfo } from "node:net";
import {
  mobileCheckoutCaptureContext,
  mobileCheckoutProjectId,
  partialRecallContext
} from "../fixtures.js";
import {
  assertMobileCheckoutRecall,
  assertPartialContextIntegrity
} from "../mobile-checkout-acceptance.js";
import type { CaptureResponse, RecallResponse } from "../types.js";

if (existsSync(".env.local")) loadEnvFile(".env.local");
process.env.NODE_ENV = "test";
process.env.ALLOWED_PROJECT_IDS = [
  ...(process.env.ALLOWED_PROJECT_IDS ?? "night-portrait").split(","),
  mobileCheckoutProjectId
].join(",");

const [{ createApiServer }, { closeApiDependencies }] = await Promise.all([
  import("../api/server.js"),
  import("../api/service.js")
]);

const server = createApiServer();
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});

const address = server.address() as AddressInfo;
const apiUrl = `http://127.0.0.1:${address.port}`;

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${await response.text()}`);
  return (await response.json()) as T;
}

try {
  assertPartialContextIntegrity(partialRecallContext);

  console.log("[1/3] Capturing Work State through POST /api/capture...");
  const capture = await post<CaptureResponse>("/api/capture", {
    projectId: mobileCheckoutProjectId,
    context: mobileCheckoutCaptureContext
  });
  if (!capture.saved || !capture.memoryId) throw new Error("Capture response was invalid.");

  console.log("[2/3] Recalling from intentionally partial context through POST /api/recall...");
  const recall = await post<RecallResponse>("/api/recall", {
    projectId: mobileCheckoutProjectId,
    context: partialRecallContext
  });
  const capturedMemory = recall.retrievedMemories.find(
    (memory) => memory.memoryId === capture.memoryId
  );
  if (!capturedMemory) throw new Error("Recall did not retrieve the memory saved by capture.");

  assertMobileCheckoutRecall(recall);

  console.log("[3/3] PASS: partial context retrieved the Mobile Checkout work frontier.");
  console.log(
    JSON.stringify(
      {
        saved: capture.saved,
        memoryId: capture.memoryId,
        extractedWorkState: capture.workState,
        retrievedMemoryCount: recall.retrievedMemories.length,
        retrievedMemoryIds: recall.retrievedMemories.map((memory) => memory.memoryId),
        topRelevantMemory: recall.retrievedMemories[0],
        recall: recall.recall,
        reconstructedWorkState: recall.reconstructedWorkState
      },
      null,
      2
    )
  );
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await closeApiDependencies();
}
