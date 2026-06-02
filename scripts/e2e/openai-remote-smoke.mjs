#!/usr/bin/env node

import { postJson, remoteSmokeConfig, requiredEnv } from "./remote-provider-smoke-helpers.mjs";

const { serverUrl, authorization } = remoteSmokeConfig();

await postJson(
  "https://api.openai.com/v1/responses",
  {
    Authorization: `Bearer ${requiredEnv("OPENAI_API_KEY", "OpenAI Remote MCP smoke")}`
  },
  {
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    tools: [
      {
        type: "mcp",
        server_label: "synapse_agentpay",
        server_description: "SynapseNetwork AgentPay Remote MCP server.",
        server_url: serverUrl,
        authorization,
        require_approval: "never",
        allowed_tools: ["discover_services"]
      }
    ],
    input: "Use the Synapse MCP server to discover one free or lowest-price weather API service. Do not invoke paid tools."
  }
);
