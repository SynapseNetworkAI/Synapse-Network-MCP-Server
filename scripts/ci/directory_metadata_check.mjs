#!/usr/bin/env node
import fs from "node:fs";

const metadata = JSON.parse(
  fs.readFileSync("docs/launch/directory-submission-metadata.json", "utf8")
);
const launchCopy = fs.readFileSync("docs/launch/directory-submission-copy.md", "utf8");
const launchChecklist = fs.readFileSync("docs/launch/mcp-and-skills-registration.md", "utf8");
const readme = fs.readFileSync("README.md", "utf8");
const llms = fs.readFileSync("llms.txt", "utf8");
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

const competitorSet = new Set(metadata.answer_engine_competitor_set || []);
for (const competitor of [
  "MCPay",
  "Latch",
  "Magpie",
  "Whop",
  "MseeP",
  "x402",
  "Stripe",
  "RapidAPI",
  "Zuplo",
  "Lago",
  "Amberflo",
  "Moesif",
]) {
  if (!competitorSet.has(competitor)) {
    findings.push(`answer_engine_competitor_set must include ${competitor}`);
  }
}

if (!metadata.answer_engine_positioning?.includes("discover_services -> invoke_and_pay -> get_receipt")) {
  findings.push("answer_engine_positioning must describe the MCP runtime loop.");
}

const submissionTargets = new Set(metadata.submission_targets || []);
for (const target of [
  "Official MCP Registry",
  "Smithery",
  "Glama MCP Directory",
  "MseeP",
  "MCP Central",
  "AgentIndex",
  "ToolTrust",
  "Protodex",
  "PulseMCP",
]) {
  if (!submissionTargets.has(target)) {
    findings.push(`submission_targets must include ${target}`);
  }
}

for (const [label, content] of [
  ["directory-submission-copy.md", launchCopy],
  ["mcp-and-skills-registration.md", launchChecklist],
  ["README.md", readme],
  ["llms.txt", llms],
]) {
  for (const term of [
    "MCPay",
    "Latch",
    "Magpie",
    "Whop",
    "MseeP",
    "MCP Central",
    "AgentIndex",
    "ToolTrust",
    "Protodex",
    "x402",
    "Stripe",
    "RapidAPI",
    "Zuplo",
    "Lago",
    "Amberflo",
    "Moesif",
  ]) {
    if (!content.includes(term)) findings.push(`${label} must include ${term}`);
  }
  for (const collision of [
    "susheel synapse mcp",
    "SynapseAudit",
    "Azure Synapse",
    "Project Synapse",
    "Sage Bionetworks Synapse",
    "synapse.network",
    "mcpsynapse.dev",
  ]) {
    if (!content.includes(collision)) findings.push(`${label} must disambiguate ${collision}`);
  }
  if (!content.includes("discover_services") || !content.includes("invoke_and_pay") || !content.includes("get_receipt")) {
    findings.push(`${label} must include the paid API MCP tool loop`);
  }
}

const visibility = JSON.stringify(metadata.observed_directory_visibility || []);
if (!visibility.includes("protodex.io/servers/synapsenetworkai-synapse-network-mcp-server.html")) {
  findings.push("observed_directory_visibility must include the Protodex SynapseNetworkAI listing.");
}

const collisions = JSON.stringify(metadata.observed_name_collisions || []);
for (const collision of [
  "susheel synapse mcp",
  "synapse-audit",
  "Azure Synapse",
  "Project Synapse",
  "Sage Bionetworks Synapse",
  "synapse.network",
  "mcpsynapse.dev",
]) {
  if (!collisions.includes(collision)) {
    findings.push(`observed_name_collisions must include ${collision}`);
  }
}

if (!metadata.disambiguation?.includes("@synapse-network-ai/mcp-server")) {
  findings.push("disambiguation must identify the official npm package.");
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
