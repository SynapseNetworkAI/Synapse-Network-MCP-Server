#!/usr/bin/env node
import fs from "node:fs";

const metadata = JSON.parse(
  fs.readFileSync("docs/launch/directory-submission-metadata.json", "utf8")
);
const findings = [];

function requireExact(key, expected) {
  if (metadata[key] !== expected) {
    findings.push(`${key} must be ${expected}`);
  }
}

requireExact("website", "https://www.synapse-network.ai/");
requireExact("repository", "https://github.com/SynapseNetworkAI/Synapse-Network-MCP-Server");
requireExact("npm_package", "@synapse-network-ai/mcp-server");
requireExact("mcp_registry_name", "io.github.SynapseNetworkAI/synapse-network-mcp-server");
requireExact("remote_mcp_endpoint", "https://mcp.synapse-network.ai/mcp");

const tools = new Set((metadata.tools || []).map((tool) => tool.name));
for (const tool of ["discover_services", "invoke_and_pay", "get_receipt"]) {
  if (!tools.has(tool)) findings.push(`tools must include ${tool}`);
}

if (!metadata.short_description?.includes("Hosted Remote MCP")) {
  findings.push("short_description must include Hosted Remote MCP.");
}

if (!metadata.short_description?.includes("paid API discovery")) {
  findings.push("short_description must include paid API discovery.");
}

if ((metadata.security_boundary || []).some((item) => /private key|seed phrase/i.test(item) && !/^No /.test(item))) {
  findings.push("security_boundary must not request private keys or seed phrases.");
}

if (findings.length) {
  for (const finding of findings) console.error(`FATAL DIRECTORY-METADATA: ${finding}`);
  process.exit(1);
}

console.log("[directory-metadata-check] passed");
