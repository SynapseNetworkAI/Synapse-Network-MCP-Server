#!/usr/bin/env node
import { ConfigError } from "./config.js";
import { runStdioServer } from "./server.js";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  process.stdout.write(`SynapseNetwork MCP Server\n\nRequired env:\n  SYNAPSE_AGENT_KEY=agt_xxx\n\nOptional env:\n  SYNAPSE_ENV=staging|prod\n  SYNAPSE_GATEWAY_URL=https://api-staging.synapse-network.ai\n  SYNAPSE_TIMEOUT_MS=30000\n\nRun through an MCP client over stdio, for example with npx @synapse-network/mcp-server.\n`);
  process.exit(0);
}

try {
  await runStdioServer();
} catch (error) {
  const message = error instanceof ConfigError || error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
