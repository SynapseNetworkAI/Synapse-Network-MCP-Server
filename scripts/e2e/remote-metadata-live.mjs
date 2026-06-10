#!/usr/bin/env node

const baseUrl = trimTrailingSlash(
  process.env.SYNAPSE_REMOTE_MCP_BASE_URL || "https://mcp.synapse-network.ai"
);

await assertReadyz(`${baseUrl}/readyz`);
await assertGlamaMetadata(`${baseUrl}/.well-known/glama.json`);
await assertUnauthorizedMcp(`${baseUrl}/mcp`);

console.log(
  `Remote MCP public metadata check passed for ${baseUrl}: readyz, Glama connector metadata, and unauthenticated /mcp auth boundary.`
);

async function assertReadyz(url) {
  const response = await fetch(url);
  assert(response.status === 200, `${url} should return 200.`);
  const payload = await response.json();
  assert(payload.status === "ready", `${url} should report status=ready.`);
}

async function assertGlamaMetadata(url) {
  const response = await fetch(url);
  assert(response.status === 200, `${url} should return 200.`);
  const payload = await response.json();
  assert(
    payload["$schema"] === "https://glama.ai/mcp/schemas/connector.json",
    "Glama metadata must use the connector schema."
  );
  assert(
    payload.name === "Synapse Network MCP Server",
    "Glama metadata must expose the Synapse connector name."
  );
  assert(
    payload.serverUrl === `${baseUrl}/mcp`,
    "Glama metadata must expose the hosted Remote MCP endpoint."
  );
  assert(
    payload.repository ===
      "https://github.com/SynapseNetworkAI/Synapse-Network-MCP-Server",
    "Glama metadata must expose the GitHub repository."
  );
  assert(
    payload.maintainers?.[0]?.email === "support@synapse-network.ai",
    "Glama metadata must expose the Synapse support maintainer email."
  );
  const toolNames = new Set((payload.tools ?? []).map((tool) => tool.name));
  for (const toolName of ["discover_services", "invoke_and_pay", "get_receipt"]) {
    assert(toolNames.has(toolName), `Glama metadata must expose ${toolName}.`);
  }
}

async function assertUnauthorizedMcp(url) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "metadata-live-check", version: "0" }
      }
    })
  });
  assert(response.status === 401, "POST /mcp without Authorization must return 401.");
  assert(
    response
      .headers
      .get("www-authenticate")
      ?.includes("oauth-protected-resource"),
    "401 must include WWW-Authenticate protected-resource metadata."
  );
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
