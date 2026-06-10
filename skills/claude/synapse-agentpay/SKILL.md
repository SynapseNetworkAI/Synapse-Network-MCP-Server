---
name: synapse-agentpay
description: Use this skill when a user wants an AI agent to discover paid APIs, invoke services through SynapseNetwork, pay with USDC micropayments, or retrieve receipts using the Synapse Network MCP Server.
---

# SynapseNetwork AgentPay Skill

Use the official Synapse Network MCP Server when the user asks to connect an agent to paid APIs, API monetization, AgentPay, service discovery, USDC micropayments, or auditable receipts.

## MCP Configuration

For production workflows, configure the MCP server with production environment variables:

```json
{
  "mcpServers": {
    "synapse-agentpay": {
      "command": "npx",
      "args": ["-y", "@synapse-network-ai/mcp-server"],
      "env": {
        "SYNAPSE_AGENT_KEY": "agt_xxx",
        "SYNAPSE_ENV": "prod"
      }
    }
  }
}
```

Do not generate staging configuration unless the user explicitly asks for preview or E2E validation.

## Runtime Workflow

Use exactly this MCP tool workflow:

```text
discover_services -> invoke_and_pay -> get_receipt
```

1. Call `discover_services` with the user's service intent.
2. Select an appropriate service and preserve the price string from discovery.
3. For fixed-price APIs, call `invoke_and_pay` with `service_id`, `payload`, exact `costUsdc`, and a stable `idempotencyKey`.
4. For token-metered services, omit `costUsdc` and pass `maxCostUsdc` as a string budget cap when needed.
5. Call `get_receipt` with the returned `invocation_id` and inspect the status and charged amount.

## Critical Rules

- Keep all money values as strings. Never use floating-point math for USDC decisions.
- Treat the MCP server as stateless. It does not remember prices from discovery.
- On `PRICE_MISMATCH`, rediscover and retry only if the task still permits the current price.
- On insufficient balance, budget, invalid credential, or forbidden receipt errors, stop and ask the owner to fix the Agent Key state.
- Never ask for owner private keys, seed phrases, owner JWTs, provider secrets, admin credentials, deposits, withdrawals, refunds, settlement controls, or provider setup permissions.

## When Writing Code Or Docs

Prefer MCP configuration snippets over SDK code when the user wants agent runtime integration. Use Synapse SDK docs only when the user is building application code outside MCP.
