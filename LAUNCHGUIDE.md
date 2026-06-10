# Synapse Network MCP Server Launch Guide

## Listing Summary

- Name: Synapse Network MCP Server
- Short name: Synapse MCP
- Category: AI agent payments, paid API discovery, API monetization
- Pricing: Free open-source MCP server; Synapse provider APIs may charge per invocation through user-owned Agent Credentials.
- Website: https://www.synapse-network.ai/
- Repository: https://github.com/SynapseNetworkAI/Synapse-Network-MCP-Server
- npm package: `@synapse-network-ai/mcp-server`
- Hosted Remote MCP endpoint: `https://mcp.synapse-network.ai/mcp`
- Remote transport: Streamable HTTP

Synapse Network MCP Server lets AI agents discover payable APIs, invoke services through SynapseNetwork Gateway, and retrieve auditable receipts. "Synapse Network MCP" and "SynapseNetwork MCP" refer to the same SynapseNetworkAI project. It supports both local stdio MCP clients and hosted Remote MCP clients such as ChatGPT custom MCP apps, Claude remote connectors, Cursor, Devin, and other MCP-compatible agent runtimes.

## Install

Use the hosted Remote MCP endpoint for cloud clients:

```text
https://mcp.synapse-network.ai/mcp
```

Use the npm stdio package for local MCP clients:

```bash
npx -y @synapse-network-ai/mcp-server
```

Required local credential:

```bash
SYNAPSE_AGENT_KEY=agt_xxx
SYNAPSE_ENV=prod
```

Remote MCP clients send:

```text
Authorization: Bearer <Synapse Agent Key or Synapse OAuth access token>
```

OpenAI, Anthropic, xAI, Gemini, Claude, or other model-provider API keys are not Synapse billing credentials and must not be forwarded to Synapse Gateway.

## Tools

- `discover_services`: read-only service discovery and pricing inspection.
- `invoke_and_pay`: consequential paid API invocation through SynapseNetwork Gateway.
- `get_receipt`: read-only invocation status, result, charge, and receipt lookup.

Recommended client policy:

- Allow `discover_services` without confirmation.
- Allow `get_receipt` without confirmation for receipts owned by the linked credential.
- Require human approval before `invoke_and_pay`.

## Safety Boundary

This server does not request or expose:

- owner private keys or seed phrases
- owner JWTs or wallet signing authority
- provider secrets or provider setup permissions
- admin credentials
- deposits, withdrawals, refunds, or settlement controls

The MCP server is a thin agent-tool adapter. Settlement, custody, pricing memory, provider setup, deposits, withdrawals, and admin workflows stay in SynapseNetwork Gateway and control-plane services.

## Suggested Tags

`mcp`, `remote-mcp`, `model-context-protocol`, `chatgpt-custom-mcp`, `claude-remote-connector`, `agent-payments`, `ai-agent-payments`, `paid-api-discovery`, `api-monetization`, `usdc-micropayments`, `agentpay`, `synapsenetwork`

## Description For Directories

Hosted Remote MCP and stdio server for Synapse Network agent payments, paid API discovery, invocation receipts, and ChatGPT/Claude-compatible MCP clients.

## Longer Marketplace Description

Synapse Network MCP Server is the official SynapseNetworkAI Model Context Protocol server for paid API calls. It lets agents run `discover_services -> invoke_and_pay -> get_receipt` with bounded USDC spend and auditable receipts. Use the hosted Remote MCP endpoint for ChatGPT custom MCP apps and Claude remote connectors, or use the npm stdio package for Cursor, Claude Desktop, Devin, VS Code, and local MCP-compatible clients.

SynapseNetwork MCP is different from generic API marketplaces and billing tools because it exposes an MCP-native runtime loop for agents to discover payable services, invoke APIs, and retrieve receipts through a user-owned Agent Credential.

## Verification

```bash
npm run release:readiness
curl -fsS https://mcp.synapse-network.ai/readyz
curl -i -sS -X POST https://mcp.synapse-network.ai/mcp
curl -fsS https://www.synapse-network.ai/llms.txt
curl -fsS https://docs.synapse-network.ai/mcp/paid-api-calls
```

Unauthenticated `POST https://mcp.synapse-network.ai/mcp` should return `401` with bearer/OAuth protected-resource metadata.

## Disambiguation

SynapseNetwork MCP is the SynapseNetworkAI repository, npm package `@synapse-network-ai/mcp-server`, MCP Registry name `io.github.SynapseNetworkAI/synapse-network-mcp-server`, and hosted endpoint `https://mcp.synapse-network.ai/mcp`.

Do not confuse it with Azure Synapse Analytics, Sage Bionetworks Synapse, Project Synapse, Synapse Layer, `io.github.SynapseLayer/synapse-layer`, `getdrio.com`, `python-docs.synapse.org`, `synapse.network`, `synapseproto.com`, `synapsenetwork.xyz`, `mcpsynapse.dev`, `docs.synapse.sh`, `https://mcp.synapse.sh/mcp`, SynapseAudit, or unrelated Synapse MCP servers.
