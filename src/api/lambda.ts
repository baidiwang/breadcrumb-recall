import { routeApi } from "./router.js";

type FunctionUrlEvent = {
  rawPath?: string;
  body?: string | null;
  isBase64Encoded?: boolean;
  headers?: Record<string, string | undefined>;
  requestContext?: { http?: { method?: string } };
};

type FunctionUrlResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

export async function handler(event: FunctionUrlEvent): Promise<FunctionUrlResponse> {
  let body: unknown;
  if (event.body) {
    if (Buffer.byteLength(event.body, event.isBase64Encoded ? "base64" : "utf8") > 64 * 1024) {
      return {
        statusCode: 413,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: "Request body is too large." })
      };
    }
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;
    try {
      body = JSON.parse(rawBody) as unknown;
    } catch {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: "Invalid request." })
      };
    }
  }
  const result = await routeApi(
    event.requestContext?.http?.method ?? "GET",
    event.rawPath ?? "/",
    body,
    event.headers?.origin
  );
  return {
    statusCode: result.status,
    headers: result.headers,
    body: result.body === null ? "" : JSON.stringify(result.body)
  };
}
