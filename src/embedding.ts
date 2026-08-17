import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import {
  EMBEDDING_DIMENSIONS,
  LOCAL_EMBEDDING_DTYPE,
  LOCAL_EMBEDDING_MODEL
} from "./embedding-config.js";

export type Embedder = {
  modelId: string;
  dimensions: number;
  embed: (text: string) => Promise<number[]>;
};

let extractorPromise: Promise<FeatureExtractionPipeline> | undefined;

const createFeatureExtractionPipeline = pipeline as unknown as (
  task: "feature-extraction",
  model: string,
  options: { dtype: string }
) => Promise<FeatureExtractionPipeline>;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    env.cacheDir = process.env.EMBEDDING_CACHE_DIR ?? ".cache/transformers";
    extractorPromise = createFeatureExtractionPipeline("feature-extraction", LOCAL_EMBEDDING_MODEL, {
      dtype: LOCAL_EMBEDDING_DTYPE
    });
  }
  return extractorPromise;
}

export function createLocalEmbedder(): Embedder {

  return {
    modelId: LOCAL_EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    async embed(text: string): Promise<number[]> {
      const extractor = await getExtractor();
      const output = await extractor(text, { pooling: "mean", normalize: true });
      const embedding = Array.from(output.data, (value) => Number(value));
      if (
        embedding.length !== EMBEDDING_DIMENSIONS ||
        embedding.some((value) => typeof value !== "number" || !Number.isFinite(value))
      ) {
        throw new Error(
          `Local model returned an invalid ${EMBEDDING_DIMENSIONS}-dimension embedding.`
        );
      }
      return embedding;
    }
  };
}
