#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { ConfigError, loadRemoteServerConfig, type RemoteServerConfig } from "./config.js";
import { resolveRemoteAuthContext, RemoteAuthError, ScopedSynapseGatewayClient, type RemoteAuthContext } from "./remote-auth.js";
import { createServer } from "./server.js";

type TransportKind = "sse" | "streamable";

interface BaseStoredTransport {
  auth: RemoteAuthContext;
  timeout: NodeJS.Timeout;
}

interface StoredSseTransport extends BaseStoredTransport {
  kind: "sse";
  transport: SSEServerTransport;
}

interface StoredStreamableTransport extends BaseStoredTransport {
  kind: "streamable";
  transport: StreamableHTTPServerTransport;
}

type StoredTransport = StoredSseTransport | StoredStreamableTransport;

const MCP_PATH = "/mcp";
const SSE_PATH = "/mcp/sse";
const MESSAGES_PATH = "/mcp/messages";

const transports = new Map<string, StoredTransport>();

export async function runHttpServer(config = loadRemoteServerConfig()): Promise<void> {
  const server = createHttpServer((req, res) => {
    handleRequest(req, res, config).catch((error) => sendUnhandledError(res, error, config));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, resolve);
  });

  process.stderr.write(`Synapse Remote MCP listening on http://${config.host}:${config.port}\n`);

  process.once("SIGINT", async () => {
    await closeAllTransports();
    server.close(() => process.exit(0));
  });
  process.once("SIGTERM", async () => {
    await closeAllTransports();
    server.close(() => process.exit(0));
  });
}

async function handleRequest(req: IncomingMessage, res: ServerResponse, config: RemoteServerConfig): Promise<void> {
  const url = new URL(req.url || "/", config.publicBaseUrl);
  if (!validateHost(req, res, config)) return;
  if (!validateOrigin(req, res, config)) return;
  if (await handlePublicGet(req, res, config, url)) return;
  if (await handleMcpTransport(req, res, config, url)) return;
  sendJson(res, 404, { status: "not_found" });
}

async function handlePublicGet(req: IncomingMessage, res: ServerResponse, config: RemoteServerConfig, url: URL): Promise<boolean> {
  if (req.method !== "GET") return false;
  if (url.pathname === "/healthz") {
    sendJson(res, 200, healthPayload(config));
    return true;
  }
  if (url.pathname === "/readyz") {
    sendJson(res, await readinessPayload(config));
    return true;
  }
  if (url.pathname.startsWith("/.well-known/oauth-protected-resource")) {
    sendJson(res, 200, protectedResourceMetadata(config));
    return true;
  }
  if (url.pathname === "/.well-known/oauth-authorization-server") {
    sendOptionalAuthServerMetadata(res, config);
    return true;
  }
  return false;
}

async function handleMcpTransport(req: IncomingMessage, res: ServerResponse, config: RemoteServerConfig, url: URL): Promise<boolean> {
  if (url.pathname === MCP_PATH) {
    await handleStreamableRequest(req, res, config);
    return true;
  }
  if (req.method === "GET" && url.pathname === SSE_PATH) {
    await handleSseRequest(req, res, config);
    return true;
  }
  if (req.method === "POST" && url.pathname === MESSAGES_PATH) {
    await handleSseMessageRequest(req, res, config, url);
    return true;
  }
  return false;
}

async function handleStreamableRequest(req: IncomingMessage, res: ServerResponse, config: RemoteServerConfig): Promise<void> {
  const auth = await authenticate(req, config);
  const sessionId = singleHeader(req.headers["mcp-session-id"]);
  const parsedBody = req.method === "POST" ? await parseJsonBody(req) : undefined;
  const existing = sessionId ? transports.get(sessionId) : undefined;

  if (existing && sessionId) {
    if (existing.kind !== "streamable" || !sameToken(existing, auth)) return sendJsonRpcError(res, 400, "INVALID_SESSION_TRANSPORT", "Session exists but uses a different transport or token.");
    refreshTransport(sessionId, existing, config);
    return existing.transport.handleRequest(req, res, parsedBody);
  }

  if (sessionId) return sendJsonRpcError(res, 404, "SESSION_NOT_FOUND", "No Streamable HTTP session found for Mcp-Session-Id.");
  if (req.method !== "POST" || !isInitializeRequest(parsedBody)) {
    return sendJsonRpcError(res, 400, "INITIALIZE_REQUIRED", "Initialize with POST /mcp before sending session-bound requests.");
  }

  let transport: StreamableHTTPServerTransport;
  transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (initializedSessionId) => {
      storeTransport(initializedSessionId, "streamable", transport, auth, config);
    },
    onsessionclosed: (closedSessionId) => {
      removeTransport(closedSessionId);
    }
  });
  transport.onclose = () => {
    if (transport.sessionId) removeTransport(transport.sessionId);
  };
  await createServer(new ScopedSynapseGatewayClient(auth.serverConfig, auth.scopes)).connect(transport as unknown as Transport);
  await transport.handleRequest(req, res, parsedBody);
}

async function handleSseRequest(req: IncomingMessage, res: ServerResponse, config: RemoteServerConfig): Promise<void> {
  const auth = await authenticate(req, config);
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  const transport = new SSEServerTransport(MESSAGES_PATH, res);
  storeTransport(transport.sessionId, "sse", transport, auth, config);
  res.on("close", () => removeTransport(transport.sessionId));
  await createServer(new ScopedSynapseGatewayClient(auth.serverConfig, auth.scopes)).connect(transport as unknown as Transport);
}

async function handleSseMessageRequest(req: IncomingMessage, res: ServerResponse, config: RemoteServerConfig, url: URL): Promise<void> {
  const auth = await authenticate(req, config);
  const sessionId = url.searchParams.get("sessionId") || "";
  const existing = transports.get(sessionId);
  if (!existing) return sendJsonRpcError(res, 404, "SESSION_NOT_FOUND", "No SSE transport found for sessionId.");
  if (existing.kind !== "sse" || !sameToken(existing, auth)) return sendJsonRpcError(res, 400, "INVALID_SESSION_TRANSPORT", "Session exists but uses a different transport or token.");
  refreshTransport(sessionId, existing, config);
  await existing.transport.handlePostMessage(req, res, await parseJsonBody(req));
}

async function authenticate(req: IncomingMessage, config: RemoteServerConfig): Promise<RemoteAuthContext> {
  try {
    return await resolveRemoteAuthContext(singleHeader(req.headers.authorization), config);
  } catch (error) {
    if (error instanceof RemoteAuthError) throw error;
    throw new RemoteAuthError(401, "INVALID_TOKEN", "Remote MCP bearer token could not be validated.");
  }
}

function storeTransport(sessionId: string, kind: "sse", transport: SSEServerTransport, auth: RemoteAuthContext, config: RemoteServerConfig): void;
function storeTransport(sessionId: string, kind: "streamable", transport: StreamableHTTPServerTransport, auth: RemoteAuthContext, config: RemoteServerConfig): void;
function storeTransport(sessionId: string, kind: TransportKind, transport: SSEServerTransport | StreamableHTTPServerTransport, auth: RemoteAuthContext, config: RemoteServerConfig): void {
  removeTransport(sessionId);
  const stored = {
    kind,
    transport,
    auth,
    timeout: setTimeout(() => {
      removeTransport(sessionId);
      transport.close().catch(() => undefined);
    }, config.sseSessionTtlMs)
  } as StoredTransport;
  transports.set(sessionId, stored);
}

function refreshTransport(sessionId: string, stored: StoredTransport, config: RemoteServerConfig): void {
  clearTimeout(stored.timeout);
  stored.timeout = setTimeout(() => {
    removeTransport(sessionId);
    stored.transport.close().catch(() => undefined);
  }, config.sseSessionTtlMs);
}

function removeTransport(sessionId: string): void {
  const stored = transports.get(sessionId);
  if (stored) clearTimeout(stored.timeout);
  transports.delete(sessionId);
}

async function closeAllTransports(): Promise<void> {
  const sessions = [...transports.entries()];
  transports.clear();
  await Promise.all(sessions.map(async ([, stored]) => {
    clearTimeout(stored.timeout);
    await stored.transport.close().catch(() => undefined);
  }));
}

function sameToken(stored: StoredTransport, auth: RemoteAuthContext): boolean {
  return stored.auth.tokenFingerprint === auth.tokenFingerprint;
}

async function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  const text = await readTextBody(req);
  if (!text) return undefined;
  return JSON.parse(text) as unknown;
}

function readTextBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function validateOrigin(req: IncomingMessage, res: ServerResponse, config: RemoteServerConfig): boolean {
  const origin = singleHeader(req.headers.origin);
  if (!origin) return true;
  if (config.allowedOrigins.includes(origin)) return true;
  sendJson(res, 403, { status: "forbidden", code: "ORIGIN_NOT_ALLOWED" });
  return false;
}

function validateHost(req: IncomingMessage, res: ServerResponse, config: RemoteServerConfig): boolean {
  const host = singleHeader(req.headers.host);
  if (host && isAllowedHost(host, config.allowedHosts)) return true;
  sendJson(res, 400, { status: "bad_request", code: "HOST_NOT_ALLOWED" });
  return false;
}

function isAllowedHost(host: string, allowedHosts: readonly string[]): boolean {
  const normalized = host.replace(/:\d+$/, "");
  return allowedHosts.includes(host) || allowedHosts.includes(normalized);
}

async function readinessPayload(config: RemoteServerConfig): Promise<[number, unknown]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_000);
  try {
    const response = await fetch(`${config.gatewayUrl}/healthz`, { method: "GET", signal: controller.signal });
    return [response.status >= 500 ? 503 : 200, { status: response.status >= 500 ? "degraded" : "ready", gatewayStatus: response.status }];
  } catch (error) {
    return [503, { status: "degraded", error: error instanceof Error ? error.message : String(error) }];
  } finally {
    clearTimeout(timeout);
  }
}

function healthPayload(config: RemoteServerConfig): unknown {
  return {
    status: "ok",
    transports: ["streamable_http", "http_sse"],
    endpoints: {
      streamable: `${config.publicBaseUrl}${MCP_PATH}`,
      sse: `${config.publicBaseUrl}${SSE_PATH}`,
      messages: `${config.publicBaseUrl}${MESSAGES_PATH}`
    }
  };
}

function protectedResourceMetadata(config: RemoteServerConfig): unknown {
  return {
    resource: `${config.publicBaseUrl}${MCP_PATH}`,
    authorization_servers: config.oauthIssuer ? [config.oauthIssuer] : [],
    bearer_methods_supported: ["header"],
    scopes_supported: ["synapse.discovery.read", "synapse.invocations.write", "synapse.receipts.read"]
  };
}

function sendOptionalAuthServerMetadata(res: ServerResponse, config: RemoteServerConfig): void {
  if (!config.oauthIssuer) return sendJson(res, 404, { status: "not_found" });
  sendJson(res, 200, {
    issuer: config.oauthIssuer,
    jwks_uri: config.oauthJwksUrl,
    authorization_endpoint: `${config.oauthIssuer}/authorize`,
    token_endpoint: `${config.oauthIssuer}/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"]
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void;
function sendJson(res: ServerResponse, statusAndPayload: [number, unknown]): void;
function sendJson(res: ServerResponse, statusOrPair: number | [number, unknown], payload?: unknown): void {
  const [status, body] = Array.isArray(statusOrPair) ? statusOrPair : [statusOrPair, payload];
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function sendJsonRpcError(res: ServerResponse, status: number, code: string, message: string): void {
  sendJson(res, status, {
    jsonrpc: "2.0",
    error: { code: -32000, message, data: { code } },
    id: null
  });
}

function sendUnhandledError(res: ServerResponse, error: unknown, config: RemoteServerConfig): void {
  if (res.headersSent) return;
  if (error instanceof RemoteAuthError) {
    if (error.status === 401) {
      res.setHeader("WWW-Authenticate", `Bearer resource_metadata="${config.publicBaseUrl}/.well-known/oauth-protected-resource"`);
    }
    return sendJsonRpcError(res, error.status, error.code, error.message);
  }
  const message = error instanceof Error ? error.message : String(error);
  sendJsonRpcError(res, 500, "REMOTE_MCP_ERROR", message);
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runHttpServer().catch((error) => {
    const message = error instanceof ConfigError || error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
