# Synapse MCP Agent Instructions

You are using the official SynapseNetwork MCP server.

Website: https://synapse-network.ai/

Before editing this repository, read `README.md`, `SECURITY.md`, and `CONTRIBUTING.md`. For support and public bug reports, use GitHub Issues. Do not invent support email addresses.

Critical runtime rules:

1. Use only the MCP tools exposed by this server: `discover_services`, `invoke_and_pay`, `get_receipt`.
2. Never ask for owner private keys, wallet seed phrases, owner JWTs, provider secrets, admin credentials, internal service tokens, deposit permissions, withdrawal permissions, refund permissions, settlement controls, or provider setup permissions.
3. Always call `discover_services` before `invoke_and_pay` unless the user gave you a fresh service id and price from discovery.
4. For fixed-price APIs, always pass `costUsdc` as the exact decimal string observed from discovery.
5. For token-metered LLM services, omit `costUsdc` and pass `maxCostUsdc` as a string budget cap when needed.
6. Always provide a stable `idempotencyKey` when you can derive one from the task; otherwise the MCP server will generate one.
7. Always call `get_receipt` after `invoke_and_pay` and inspect the final status.
8. If Gateway returns `PRICE_MISMATCH`, rediscover the service and retry with the updated `costUsdc` only if the user/task still permits the new price.
9. If Gateway returns balance, budget, credential, or forbidden errors, stop and ask the owner to fix funding, budget, or credential state.
10. Treat the MCP server as stateless. Do not assume it remembers earlier tool calls.
11. Keep money as strings. Do not convert USDC values to JavaScript numbers for business logic.

Critical contribution rules:

1. Public code APIs must return named object contracts, not raw maps such as `dict`, `Dict[str, Any]`, `Record<string, unknown>`, or `Promise<Record<string, unknown>>`.
2. Raw maps are allowed only for private helpers, request bodies, patch inputs, schema/payload fields, and external JSON parsing boundaries.
3. Do not copy large code blocks. Extract shared helpers when logic repeats.
4. Split large or complex functions before they hit CI quality budgets.
5. Any suppression comment must include `quality-disable-reason: ...`.
6. Do not add public documentation that requires developers to run a Synapse Gateway for the open-source verification path. Use `SYNAPSE_ENV=prod` for production Agent workflows; use staging only for preview/E2E validation.

Recommended flow:

```text
discover_services({ query: "cheap weather API", sort: "lowest_price" })
invoke_and_pay({ service_id, payload, costUsdc, idempotencyKey })
get_receipt({ invocation_id })
```

E2E verification and production configuration:

```bash
npm run verify:mcp
npm run ci:quality
SYNAPSE_ENV=prod npx -y @synapse-network/mcp-server --help
SYNAPSE_AGENT_KEY=agt_xxx SYNAPSE_ENV=staging npm run test:e2e:staging
```

The MCP server is a pure adapter over Synapse Gateway. Gateway remains the source of truth for price validation, risk, budget, settlement, and receipts. Do not generate staging configuration when the user asks for production setup.
