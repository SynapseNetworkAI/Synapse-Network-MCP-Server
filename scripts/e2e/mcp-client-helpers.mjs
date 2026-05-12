import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export const EXPECTED_TOOLS = ["discover_services", "get_receipt", "invoke_and_pay"];

const BASE_ENV_ALLOWLIST = new Set([
  "PATH",
  "HOME",
  "USER",
  "TMPDIR",
  "TMP",
  "TEMP",
  "SHELL",
  "SystemRoot",
  "ComSpec",
  "PATHEXT",
  "SSL_CERT_FILE",
  "NODE_EXTRA_CA_CERTS"
]);

const SYNAPSE_CHILD_ENV_ALLOWLIST = new Set([
  "SYNAPSE_AGENT_KEY",
  "SYNAPSE_ENV",
  "SYNAPSE_GATEWAY_URL",
  "SYNAPSE_TIMEOUT_MS"
]);

export async function withMcpClient(env, fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js"],
    env: buildMcpChildEnv(env),
    stderr: "pipe"
  });
  const client = new Client({ name: "synapse-e2e-client", version: "0.1.0" });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });

  try {
    await client.connect(transport);
    return await fn(client);
  } catch (error) {
    if (stderr.trim()) {
      console.error("\n[MCP server stderr]");
      console.error(stderr.trim());
    }
    throw error;
  } finally {
    await client.close().catch(() => undefined);
  }
}

export async function assertToolList(client) {
  const tools = await client.listTools();
  const names = tools.tools.map((tool) => tool.name).sort();
  assertDeepEqual(names, EXPECTED_TOOLS, `Expected MCP tools ${EXPECTED_TOOLS.join(", ")} but got ${names.join(", ")}`);
  return tools;
}

export async function callToolData(client, name, args) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) {
    throw new Error(`Tool ${name} returned error: ${JSON.stringify(result.structuredContent ?? result.content, null, 2)}`);
  }
  if (result.structuredContent && Object.prototype.hasOwnProperty.call(result.structuredContent, "data")) {
    return result.structuredContent.data;
  }
  const text = result.content?.find((item) => item.type === "text")?.text;
  if (!text) throw new Error(`Tool ${name} did not return structuredContent.data or text content.`);
  return JSON.parse(text);
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}\nExpected: ${expectedJson}\nActual: ${actualJson}`);
  }
}

export function asRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

export function buildMcpChildEnv(overrides = {}, baseEnv = process.env) {
  const childEnv = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (isAllowedBaseEnv(key) || key.startsWith("SYNAPSE_E2E_")) {
      assignStringEnv(childEnv, key, value);
    }
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (isAllowedOverrideEnv(key)) {
      assignStringEnv(childEnv, key, value);
    }
  }
  return childEnv;
}

function isAllowedBaseEnv(key) {
  return BASE_ENV_ALLOWLIST.has(key);
}

function isAllowedOverrideEnv(key) {
  return SYNAPSE_CHILD_ENV_ALLOWLIST.has(key) || key.startsWith("SYNAPSE_E2E_") || BASE_ENV_ALLOWLIST.has(key);
}

function assignStringEnv(target, key, value) {
  if (typeof value === "string" && value.length > 0) {
    target[key] = value;
  }
}
