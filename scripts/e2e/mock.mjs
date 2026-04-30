#!/usr/bin/env node
import http from "node:http";
import { assert, assertToolList, callToolData, withMcpClient } from "./mcp-client-helpers.mjs";

const requests = [];
const invocationId = "inv_mock_weather_001";

const server = http.createServer(async (req, res) => {
  const body = await readBody(req);
  const parsedBody = body ? JSON.parse(body) : undefined;
  requests.push({ method: req.method, url: req.url, headers: req.headers, body: parsedBody });

  if (req.method === "POST" && req.url === "/api/v1/agent/discovery/search") {
    return sendJson(res, 200, {
      requestId: "disc_mock_001",
      results: [
        {
          serviceId: "svc_mock_weather",
          serviceName: "Mock Weather",
          serviceKind: "api",
          priceModel: "fixed",
          priceUsdc: "0.000000",
          pricing: { amount: "0.000000", currency: "USDC" },
          summary: "Mock free weather service for MCP E2E.",
          inputSchema: { type: "object", properties: { city: { type: "string" } }, required: ["city"] }
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
    assert(req.headers["x-credential"] === "agt_test", "invoke must pass X-Credential.");
    assert(parsedBody.serviceId === "svc_mock_weather", "invoke must pass serviceId.");
    assert(parsedBody.costUsdc === "0.000000", "invoke must pass fixed-price costUsdc string.");
    assert(parsedBody.idempotencyKey === "mcp-mock-e2e-001", "invoke must pass stable idempotencyKey.");
    assert(parsedBody.payload?.body?.city === "Kuala Lumpur", "invoke must wrap provider payload in payload.body.");
    return sendJson(res, 200, {
      invocationId,
      status: "SUCCEEDED",
      chargedUsdc: "0.000000",
      result: { forecast: "clear" },
      receipt: { quoteId: "quote_mock_001", invocationId }
    });
  }

  if (req.method === "GET" && req.url === `/api/v1/agent/invocations/${invocationId}`) {
    assert(req.headers["x-credential"] === "agt_test", "receipt must pass X-Credential.");
    return sendJson(res, 200, {
      invocationId,
      status: "SUCCEEDED",
      chargedUsdc: "0.000000",
      result: { forecast: "clear" },
      receipt: { quoteId: "quote_mock_001", invocationId }
    });
  }

  sendJson(res, 404, { detail: { code: "NOT_FOUND", message: `${req.method} ${req.url}` } });
});

server.listen(0, "127.0.0.1", async () => {
  const { port } = server.address();
  try {
    await withMcpClient(
      {
        SYNAPSE_AGENT_KEY: "agt_test",
        SYNAPSE_GATEWAY_URL: `http://127.0.0.1:${port}`
      },
      async (client) => {
        await assertToolList(client);

        const discovery = await callToolData(client, "discover_services", { query: "free weather", limit: 10, sort: "lowest_price" });
        assert(discovery.results?.[0]?.serviceId === "svc_mock_weather", "discover_services should return mock service.");

        const invoke = await callToolData(client, "invoke_and_pay", {
          service_id: "svc_mock_weather",
          payload: { city: "Kuala Lumpur" },
          costUsdc: "0.000000",
          idempotencyKey: "mcp-mock-e2e-001"
        });
        assert(invoke.gateway?.invocationId === invocationId, "invoke_and_pay should return invocation id.");
        assert(invoke.gateway?.chargedUsdc === "0.000000", "chargedUsdc should remain a string.");

        const receipt = await callToolData(client, "get_receipt", { invocation_id: invocationId });
        assert(receipt.invocationId === invocationId, "get_receipt should return invocation id.");
        assert(receipt.status === "SUCCEEDED", "get_receipt should return terminal status.");
      }
    );

    assert(requests.some((request) => request.url === "/api/v1/agent/discovery/search"), "mock Gateway should receive discovery request.");
    assert(requests.some((request) => request.url === "/api/v1/agent/invoke"), "mock Gateway should receive invoke request.");
    assert(requests.some((request) => request.url === `/api/v1/agent/invocations/${invocationId}`), "mock Gateway should receive receipt request.");
    console.log("Mock MCP E2E passed: tools listed and discover -> invoke -> receipt completed over stdio.");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});

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
