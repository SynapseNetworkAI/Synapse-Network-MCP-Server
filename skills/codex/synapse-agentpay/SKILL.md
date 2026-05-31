---
name: synapse-agentpay
description: Use when implementing, reviewing, testing, or documenting SynapseNetwork MCP Server integrations, registry submissions, AgentPay workflows, or production MCP configuration.
---

# SynapseNetwork MCP Server Skill

Use this skill for SynapseNetwork MCP Server repository work and for generating correct AgentPay integration guidance.

## Repository Rules

- Read `llms.txt`, `README.md`, `SECURITY.md`, and `CONTRIBUTING.md` before editing.
- Keep the MCP server stateless. Do not add discovery caches, local persistence, settlement logic, custody logic, or provider/admin tools.
- Use native Gateway HTTP calls. Do not import the Synapse SDK into this MCP package.
- Public examples must use `SYNAPSE_ENV=prod`; staging is only for preview/E2E validation.
- Public code APIs must return named object contracts, not raw maps.
- Extract duplicated logic and keep functions within the repository quality budgets.

## Runtime Integration Rules

Use this workflow:

```text
discover_services -> invoke_and_pay -> get_receipt
```

For fixed-price services, pass `costUsdc` as the exact string from discovery. For token-metered services, use `maxCostUsdc` as a string cap when needed. Always provide or preserve a stable `idempotencyKey`.

## Security Boundary

The MCP server uses only `SYNAPSE_AGENT_KEY=agt_xxx`. Never add docs, tests, config, or code that asks for owner private keys, seed phrases, owner JWTs, provider secrets, admin credentials, internal service tokens, deposits, withdrawals, refunds, settlement controls, or provider setup permissions.

## Validation Commands

```bash
npm run verify:mcp
npm run ci:quality
npm run smoke:cli
npm pack --dry-run
```

For production release validation, run prod E2E explicitly with a production Agent Key. Do not add prod live E2E to default CI.
