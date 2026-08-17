import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { routeApi } from "./router.js";

const MAX_BODY_BYTES = 64 * 1024;

if (existsSync(".env.local")) loadEnvFile(".env.local");

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body is too large.");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

export function createApiServer() {
  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      const body = request.method === "POST" ? await readJson(request) : undefined;
      const origin = typeof request.headers.origin === "string" ? request.headers.origin : undefined;
      const result = await routeApi(request.method ?? "GET", url.pathname, body, origin);
      response.writeHead(result.status, result.headers);
      response.end(result.body === null ? undefined : JSON.stringify(result.body));
    } catch {
      response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Invalid request." }));
    }
  });
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? "8787");
  createApiServer().listen(port, () => {
    console.log(`Breadcrumb Recall API listening on http://localhost:${port}`);
  });
}
