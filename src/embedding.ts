import {
  BedrockRuntimeClient,
  InvokeModelCommand
} from "@aws-sdk/client-bedrock-runtime";

const dimensions = 1024;

export type Embedder = {
  modelId: string;
  dimensions: number;
  embed: (text: string) => Promise<number[]>;
};

export function createBedrockEmbedder(): Embedder {
  const region = process.env.AWS_REGION ?? "us-east-1";
  const modelId = process.env.BEDROCK_EMBED_MODEL ?? "amazon.titan-embed-text-v2:0";
  const client = new BedrockRuntimeClient({ region });

  return {
    modelId,
    dimensions,
    async embed(text: string): Promise<number[]> {
      const response = await client.send(
        new InvokeModelCommand({
          modelId,
          contentType: "application/json",
          accept: "application/json",
          body: JSON.stringify({
            inputText: text,
            dimensions,
            normalize: true,
            embeddingTypes: ["float"]
          })
        })
      );

      const payload = JSON.parse(new TextDecoder().decode(response.body)) as {
        embedding?: unknown;
      };
      if (
        !Array.isArray(payload.embedding) ||
        payload.embedding.length !== dimensions ||
        payload.embedding.some((value) => typeof value !== "number")
      ) {
        throw new Error(`Bedrock returned an invalid ${dimensions}-dimension embedding.`);
      }
      return payload.embedding as number[];
    }
  };
}
