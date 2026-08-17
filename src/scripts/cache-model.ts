import { createLocalEmbedder } from "../embedding.js";

const embedder = createLocalEmbedder();
const embedding = await embedder.embed("Cache Breadcrumb Recall embedding model.");
if (embedding.length !== embedder.dimensions) throw new Error("Embedding model cache check failed.");
console.log(`Cached ${embedder.modelId} (${embedding.length} dimensions).`);
