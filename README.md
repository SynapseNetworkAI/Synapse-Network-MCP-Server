# SynapseNetwork MCP Server

Stateless MCP stdio server for giving Cursor, Claude Desktop, Devin, and agent frameworks access to SynapseNetwork service discovery, paid invocation, and receipts.

The server is intentionally thin:

- No in-memory discovery cache.
- No local persistence.
- No owner/admin/provider control-plane tools.
- No Synapse SDK import.
- Direct Gateway HTTP calls with native `fetch`.
- Money values stay decimal strings.

## Tools

### `discover_services`

Searches SynapseNetwork services through:

```text
POST /api/v1/agent/discovery/search
```

Inputs:

- `query` optional natural-language intent.
- `tags` optional tag filter.
- `limit` optional result limit, max 50.
- `sort` optional: `best_match`, `lowest_price`, `fastest`, `highest_reliability`.

### `invoke_and_pay`

Invokes a service through:

```text
POST /api/v1/agent/invoke
```

Inputs:

- `service_id` required service id from `discover_services`.
- `payload` required JSON payload for the provider service.
- `costUsdc` USDC decimal string copied from discovery for fixed-price APIs, for example `"0.050000"`.
- `idempotencyKey` optional but strongly recommended stable task-level key.
- `maxCostUsdc` optional decimal string cap for token-metered or LLM services.
- `requestId` optional trace id.
- `responseMode` optional, default `sync`.

For fixed-price APIs, `costUsdc` must match the discovered price. If it is stale or wrong, Gateway returns `PRICE_MISMATCH`; rediscover and retry with the current price. For token-metered LLM services, omit `costUsdc` and pass `maxCostUsdc` when a budget cap is needed. The MCP server never caches or fills prices.

### `get_receipt`

Fetches invocation status and receipt through:

```text
GET /api/v1/agent/invocations/{invocation_id}
```

Gateway enforces that the receipt belongs to the configured Agent Key.

## Install

```bash
npm install -g @synapse-network/mcp-server
```

Or use `npx` from an MCP client:

```bash
npx -y @synapse-network/mcp-server
```

## Configuration

Required:

```bash
export SYNAPSE_AGENT_KEY=agt_xxx
```

Optional:

```bash
export SYNAPSE_ENV=staging        # staging | prod, default staging
export SYNAPSE_GATEWAY_URL=...    # overrides SYNAPSE_ENV
export SYNAPSE_TIMEOUT_MS=30000
```

Credential aliases are accepted for compatibility: `SYNAPSE_API_KEY` and `SYNAPSE_AGENT_TOKEN`.

This server never needs owner private keys, owner JWTs, provider secrets, admin credentials, deposit permissions, withdrawal permissions, or provider setup permissions.

## Claude Desktop

```json
{
  "mcpServers": {
    "synapse-agentpay": {
      "command": "npx",
      "args": ["-y", "@synapse-network/mcp-server"],
      "env": {
        "SYNAPSE_AGENT_KEY": "agt_xxx",
        "SYNAPSE_ENV": "staging"
      }
    }
  }
}
```

## Cursor

Add an MCP server with the same command and environment:

```json
{
  "command": "npx",
  "args": ["-y", "@synapse-network/mcp-server"],
  "env": {
    "SYNAPSE_AGENT_KEY": "agt_xxx",
    "SYNAPSE_ENV": "staging"
  }
}
```

## Agent Usage Rules

1. Call `discover_services` before `invoke_and_pay`.
2. For fixed-price APIs, copy the observed service price into `costUsdc` exactly as a string.
3. Provide a stable `idempotencyKey` for each task when possible.
4. After invocation, call `get_receipt` and inspect `status` and `chargedUsdc`.
5. On `PRICE_MISMATCH`, rediscover and retry with the updated price.
6. On budget or balance errors, stop and ask the owner to fund or adjust the Agent Key budget.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
npm run test:e2e:mock
npm run ci:quality
npm pack --dry-run
```

## Quality Gates

CI runs `npm run verify:mcp`, `npm run smoke:cli`, `npm run ci:quality`, and `npm pack --dry-run`.

`npm run ci:source-quality` enforces public object contracts:

- Public functions and methods must not return raw maps such as `dict`, `Dict[str, Any]`, `Record<string, unknown>`, or `Promise<Record<string, unknown>>`.
- Return named objects instead, such as TypeScript interfaces/types or Python dataclasses/Pydantic models.
- Raw maps remain allowed for private helpers, request bodies, patch inputs, schema/payload fields, and external JSON parsing boundaries.

`npm run ci:quality-budget` keeps the package small and maintainable:

- Production source files have a 500 effective-line budget; support files and tests have a 350 effective-line budget.
- Production functions have an 80 effective-line budget; support/test functions have a 120 effective-line budget.
- Cyclomatic complexity budget is 12.
- Obvious duplicated code blocks fail and should be extracted into shared helpers.
- Suppression comments such as `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `noqa`, or `type: ignore` must include `quality-disable-reason: ...`.

## E2E Verification

The open-source MCP server is staging-first. Developers do not need to run a local Synapse Gateway to verify MCP compatibility.

Protocol-only E2E with a mock Gateway:

```bash
npm run verify:mcp
```

This checks type safety, unit tests, build output, MCP stdio tool discovery, and the full mock flow:

```text
discover_services -> invoke_and_pay -> get_receipt
```

Live staging E2E:

```bash
export SYNAPSE_AGENT_KEY=agt_xxx
export SYNAPSE_ENV=staging

npm run test:e2e:staging
```

By default, staging E2E performs broad discovery with `sort=lowest_price`, then selects a free fixed-price service by inspecting price fields. `SYNAPSE_E2E_QUERY` is optional and should be a real service intent such as `oss`, `weather`, or `sentiment`, not a price filter. Legacy price-only values such as `free` are treated as broad discovery for compatibility. The script refuses paid invokes unless explicitly allowed.

Specified staging service:

```bash
export SYNAPSE_AGENT_KEY=agt_xxx
export SYNAPSE_ENV=staging
export SYNAPSE_E2E_SERVICE_ID=svc_quotes_famous_top3
export SYNAPSE_E2E_PAYLOAD_JSON='{"topic":"agent payments"}'
export SYNAPSE_E2E_COST_USDC='0.000000'

npm run test:e2e:staging
```

Token-metered staging service:

```bash
export SYNAPSE_AGENT_KEY=agt_xxx
export SYNAPSE_ENV=staging
export SYNAPSE_E2E_SERVICE_ID=svc_deepseek_chat
export SYNAPSE_E2E_PAYLOAD_JSON='{"messages":[{"role":"user","content":"hello"}],"max_tokens":32}'
export SYNAPSE_E2E_MAX_COST_USDC='0.100000'

npm run test:e2e:staging
```

Future production E2E is available only as an explicit command after prod is ready:

```bash
export SYNAPSE_AGENT_KEY=agt_prod_xxx
export SYNAPSE_ENV=prod
export SYNAPSE_E2E_SERVICE_ID=svc_prod_smoke
export SYNAPSE_E2E_COST_USDC='0.000000'

npm run test:e2e:prod
```

## Registry Publishing

The repo includes `server.json` for the MCP Registry publisher flow. After publishing the npm package:

```bash
mcp-publisher login github
mcp-publisher publish
```

The registry only hosts metadata; npm hosts the package artifact.
