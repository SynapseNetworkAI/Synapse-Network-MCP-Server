export function requiredEnv(name, label) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`${name} is required for ${label}.`);
    process.exit(2);
  }
  return value;
}

export async function postJson(url, headers, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok) {
    console.error(JSON.stringify(payload, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify(payload, null, 2));
}

export function remoteSmokeConfig() {
  return {
    serverUrl: process.env.SYNAPSE_REMOTE_MCP_URL || "https://mcp.synapse-network.ai/mcp/sse",
    authorization: requiredEnv("SYNAPSE_REMOTE_MCP_AUTH_TOKEN", "Remote MCP smoke")
  };
}
