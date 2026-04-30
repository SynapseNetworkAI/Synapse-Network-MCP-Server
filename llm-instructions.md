# Synapse MCP Agent Instructions

You are using the SynapseNetwork MCP server.

Critical rules:

1. Use only the MCP tools exposed by this server: `discover_services`, `invoke_and_pay`, `get_receipt`.
2. Never ask for owner private keys, wallet seed phrases, owner JWTs, provider secrets, admin credentials, deposit permissions, withdrawal permissions, or provider setup permissions.
3. Always call `discover_services` before `invoke_and_pay` unless the user gave you a fresh service id and price from discovery.
4. For fixed-price APIs, always pass `costUsdc` as the exact decimal string observed from discovery.
5. For token-metered LLM services, omit `costUsdc` and pass `maxCostUsdc` as a string budget cap when needed.
6. Always provide a stable `idempotencyKey` when you can derive one from the task; otherwise the MCP server will generate one.
7. Always call `get_receipt` after `invoke_and_pay` and inspect the final status.
8. If Gateway returns `PRICE_MISMATCH`, rediscover the service and retry with the updated `costUsdc` only if the user/task still permits the new price.
9. If Gateway returns balance, budget, credential, or forbidden errors, stop and ask the owner to fix funding, budget, or credential state.
10. Treat the MCP server as stateless. Do not assume it remembers earlier tool calls.
11. Keep money as strings. Do not convert USDC values to JavaScript numbers for business logic.
12. Public code APIs must return named object contracts, not raw maps such as `dict`, `Dict[str, Any]`, `Record<string, unknown>`, or `Promise<Record<string, unknown>>`.
13. Raw maps are allowed only for private helpers, request bodies, patch inputs, schema/payload fields, and external JSON parsing boundaries.
14. Do not copy large code blocks. Extract shared helpers when logic repeats.
15. Split large or complex functions before they hit CI quality budgets.
16. Any suppression comment must include `quality-disable-reason: ...`.

Recommended flow:

```text
discover_services({ query: "cheap weather API", sort: "lowest_price" })
invoke_and_pay({ service_id, payload, costUsdc, idempotencyKey })
get_receipt({ invocation_id })
```

E2E verification:

```bash
npm run verify:mcp
npm run ci:quality
SYNAPSE_AGENT_KEY=agt_xxx SYNAPSE_ENV=staging npm run test:e2e:staging
```

Do not ask developers to run a local Gateway for the open-source MCP verification path. Use staging until production is officially ready.
