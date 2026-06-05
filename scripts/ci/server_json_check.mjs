#!/usr/bin/env node
import fs from "node:fs";

const metadata = JSON.parse(fs.readFileSync("server.json", "utf8"));
const findings = [];

if (typeof metadata.description !== "string" || metadata.description.length === 0) {
  findings.push("server.json description is required.");
}

if (metadata.description.length > 100) {
  findings.push(
    `server.json description must be 100 characters or fewer for MCP Registry publishing; found ${metadata.description.length}.`
  );
}

if (metadata.name !== "io.github.SynapseNetworkAI/synapse-network-mcp-server") {
  findings.push("server.json name must keep the canonical MCP Registry identifier.");
}

const remoteUrl = metadata.remotes?.[0]?.url;
if (remoteUrl !== "https://mcp.synapse-network.ai/mcp") {
  findings.push("server.json must publish the hosted Remote MCP endpoint.");
}

const npmPackage = metadata.packages?.[0]?.identifier;
if (npmPackage !== "@synapse-network-ai/mcp-server") {
  findings.push("server.json must publish the canonical npm package identifier.");
}

if (findings.length) {
  for (const finding of findings) console.error(`FATAL SERVER-JSON: ${finding}`);
  process.exit(1);
}

console.log("[server-json-check] passed");
