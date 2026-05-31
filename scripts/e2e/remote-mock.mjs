#!/usr/bin/env node
import http from "node:http";
import { spawn } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { assert, assertToolList, callToolData } from "./mcp-client-helpers.mjs";

const invocationId = "inv_remote_mock_weather_001";
const requests = [];

const gateway = http.createServer(async (req, res) => {
  const body = await readBody(req);
  const parsedBody = body ? JSON.parse(body) : undefined;
  requests.push({ method: req.method, url: req.url, headers: req.headers, body: parsedBody });

  if (req.method === "GET" && req.url === "/healthz") return sendJson(res, 404, { status: "mock-no-healthz" });

  if (req.method === "POST" && req.url === "/api/v1/agent/discovery/search") {
    assert(req.headers["x-credential"] === "agt_test", "remote discovery must map bearer token to X-Credential.");
    return sendJson(res, 200, {
      requestId: "disc_remote_mock_001",
      results: [
        {
          serviceId: "svc_remote_mock_weather",
          serviceName: "Remote Mock Weather",
          serviceKind: "api",
          priceModel: "fixed",
          priceUsdc: "0.000000",
          pricing: { amount: "0.000000", currency: "USDC" },
          summary: "Mock free weather service for Remote MCP E2E."
        }
      ],
      count: 1,
      page: 1,
      pageSize: 10,
      totalCount: 1,
      hasMore: false
    });
  }

  if (req.method === "POST" && req.url === "/api/v1/agent/invoke") {
    assert(req.headers["x-credential"] === "agt_test", "remote invoke must pass X-Credential.");
    assert(parsedBody.serviceId === "svc_remote_mock_weather", "remote invoke must pass serviceId.");
    assert(parsedBody.costUsdc === "0.000000", "remote invoke must pass string costUsdc.");
    return sendJson(res, 200, {
      invocationId,
      status: "SUCCEEDED",
      chargedUsdc: "0.000000",
      result: { forecast: "clear" },
      receipt: { quoteId: "quote_remote_mock_001", invocationId }
    });
  }

  if (req.method === "GET" && req.url === `/api/v1/agent/invocations/${invocationId}`) {
    assert(req.headers["x-credential"] === "agt_test", "remote receipt must pass X-Credential.");
    return sendJson(res, 200, {
      invocationId,
      status: "SUCCEEDED",
      chargedUsdc: "0.000000",
      result: { forecast: "clear" },
      receipt: { quoteId: "quote_remote_mock_001", invocationId }
    });
  }

  sendJson(res, 404, { detail: { code: "NOT_FOUND", message: `${req.method} ${req.url}` } });
});

gateway.listen(0, "127.0.0.1", async () => {
  let remote;
  try {
    const gatewayPort = gateway.address().port;
    const remotePort = await freePort();
    const baseUrl = `http://127.0.0.1:${remotePort}`;
    remote = spawn(process.execPath, ["dist/http.js"], {
      env: {
        ...process.env,
        SYNAPSE_MCP_HTTP_HOST: "127.0.0.1",
        SYNAPSE_MCP_HTTP_PORT: String(remotePort),
        SYNAPSE_MCP_PUBLIC_BASE_URL: baseUrl,
        SYNAPSE_GATEWAY_URL: `http://127.0.0.1:${gatewayPort}`,
        SYNAPSE_REMOTE_AUTH_MODE: "agent_key"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    remote.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    await waitForHealth(`${baseUrl}/healthz`, stderr);

    await assertPublicProbe(`${baseUrl}/healthz`);
    await assertPublicProbe(`${baseUrl}/readyz`);
    await assertUnauthorizedMcp(`${baseUrl}/mcp`);
    await assertSseSessionMiss(`${baseUrl}/mcp/messages`);
    await runStreamableFlow(`${baseUrl}/mcp`);
    await runSseFlow(`${baseUrl}/mcp/sse`);

    assert(requests.some((request) => request.url === "/api/v1/agent/discovery/search"), "remote mock Gateway should receive discovery.");
    assert(requests.some((request) => request.url === "/api/v1/agent/invoke"), "remote mock Gateway should receive invoke.");
    assert(requests.some((request) => request.url === `/api/v1/agent/invocations/${invocationId}`), "remote mock Gateway should receive receipt.");
    console.log("Remote MCP mock E2E passed: /mcp and /mcp/sse transports completed authenticated tool calls.");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    remote?.kill("SIGTERM");
    gateway.close();
  }
});

async function runStreamableFlow(url) {
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: "Bearer agt_test" } }
  });
  await withClient(transport, async (client) => {
    await assertToolList(client);
    await runPaidMockFlow(client);
  });
}

async function runSseFlow(url) {
  const authHeaders = { Authorization: "Bearer agt_test" };
  const transport = new SSEClientTransport(new URL(url), {
    eventSourceInit: {
      fetch: (input, init) => fetch(input, { ...init, headers: { ...init.headers, ...authHeaders } })
    },
    requestInit: { headers: authHeaders }
  });
  await withClient(transport, async (client) => {
    await assertToolList(client);
  });
}

async function runPaidMockFlow(client) {
  const discovery = await callToolData(client, "discover_services", { query: "free weather", limit: 10, sort: "lowest_price" });
  assert(discovery.results?.[0]?.serviceId === "svc_remote_mock_weather", "remote discover_services should return mock service.");
  const invoke = await callToolData(client, "invoke_and_pay", {
    service_id: "svc_remote_mock_weather",
    payload: { city: "Kuala Lumpur" },
    costUsdc: "0.000000",
    idempotencyKey: "remote-mcp-mock-e2e-001"
  });
  assert(invoke.gateway?.invocationId === invocationId, "remote invoke_and_pay should return invocation id.");
  const receipt = await callToolData(client, "get_receipt", { invocation_id: invocationId });
  assert(receipt.invocationId === invocationId, "remote get_receipt should return invocation id.");
}

async function withClient(transport, fn) {
  const client = new Client({ name: "synapse-remote-e2e-client", version: "0.1.0" });
  try {
    await client.connect(transport);
    return await fn(client);
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function assertPublicProbe(url) {
  const response = await fetch(url);
  assert(response.status === 200, `${url} should be public and return 200.`);
}

async function assertUnauthorizedMcp(url) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "unauth", version: "0" } } })
  });
  assert(response.status === 401, "POST /mcp without Authorization must return 401.");
  assert(response.headers.get("www-authenticate")?.includes("oauth-protected-resource"), "401 must include WWW-Authenticate resource metadata.");
}

async function assertSseSessionMiss(url) {
  const response = await fetch(`${url}?sessionId=missing`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer agt_test" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
  });
  assert(response.status === 404, "POST /mcp/messages with missing sessionId must return 404.");
}

function waitForHealth(url, stderr) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(async () => {
      try {
        const response = await fetch(url);
        if (response.ok) {
          clearInterval(timer);
          resolve();
        }
      } catch {
        // Retry until the timeout below.
      }
      if (Date.now() - started > 10_000) {
        clearInterval(timer);
        reject(new Error(`Remote MCP server did not become healthy.\n${stderr}`));
      }
    }, 100);
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

function readBody(req) {
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

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}
