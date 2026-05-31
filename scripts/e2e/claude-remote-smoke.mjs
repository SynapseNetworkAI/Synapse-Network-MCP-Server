#!/usr/bin/env node

import { postJson, remoteSmokeConfig, requiredEnv } from "./remote-provider-smoke-helpers.mjs";

const { serverUrl, authorization } = remoteSmokeConfig();

await postJson(
  "https://api.anthropic.com/v1/messages",
  {
    "x-api-key": requiredEnv("ANTHROPIC_API_KEY", "Claude Remote MCP smoke"),
    "anthropic-version": "2023-06-01",
    "anthropic-beta": "mcp-client-2025-11-20"
  },
  {
    model: process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: "Use the Synapse MCP server to discover one free or lowest-price weather API service. Do not invoke paid tools."
      }
    ],
    mcp_servers: [
      {
        type: "url",
        url: serverUrl,
        name: "synapse-agentpay",
        authorization_token: authorization
      }
    ],
    tools: [
      {
        type: "mcp_toolset",
        mcp_server_name: "synapse-agentpay",
        default_config: { enabled: false },
        configs: {
          discover_services: { enabled: true }
        }
      }
    ]
  }
);
