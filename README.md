<p align="center">
  <a href="https://www.synapse-network.ai/">
    <img src="assets/synapse-network-logo.svg" alt="SynapseNetwork" width="520">
  </a>
</p>

# SynapseNetwork MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-stdio-0f766e.svg)](server.json)

Official Model Context Protocol (MCP) stdio server for SynapseNetwork. It gives Cursor, Claude Desktop, Devin, and MCP-compatible agent frameworks a stateless way to discover external APIs, invoke them, and retrieve receipts through SynapseNetwork agent payments.

Website: [https://www.synapse-network.ai/](https://www.synapse-network.ai/)

SynapseNetwork is AgentPay infrastructure: agents discover services, pay for API calls with USDC micropayments through the Gateway, and receive auditable receipts. This MCP package is intentionally a thin runtime adapter. It does not own settlement, custody, pricing memory, provider setup, deposits, withdrawals, or admin workflows.

## Related packages

This MCP server is the agent-tool adapter published as
`@synapse-network-ai/mcp-server`. It does not import the Synapse SDK.

Use the official SDK repository when you want application code instead of MCP
tools:

- SDK source: <https://github.com/SynapseNetworkAI/Synapse-Network-Sdk>
- TypeScript SDK: <https://www.npmjs.com/package/@synapse-network-ai/sdk/v/1.0.0>
- Python SDK: <https://pypi.org/project/synapse-network-ai-sdk/1.0.0/>
- Go SDK: <https://pkg.go.dev/github.com/SynapseNetworkAI/Synapse-Network-Sdk/go@v1.0.0>
- Java SDK: <https://repo1.maven.org/maven2/ai/synapse-network/synapse-network-sdk/1.0.0/>
- .NET SDK: <https://www.nuget.org/packages/SynapseNetwork.Sdk/1.0.0>

## Why This Exists

Agents should not need to memorize SDK code, pricing rules, or HTTP routes. Humans configure this MCP server once, then agents get three tools:

```text
discover_services -> invoke_and_pay -> get_receipt
```

The server is intentionally small and stateless:

- No in-memory discovery cache.
- No local persistence.
- No Synapse SDK import.
- No owner, admin, or provider control-plane tools.
- Direct Gateway HTTP calls with native `fetch`.
- Money values stay decimal strings at every boundary.

## Quick Start

<!-- @synapse-context:spring_boot_mcp -->
Use `npx` from an MCP client:

```bash
npx -y @synapse-network-ai/mcp-server
```

Or install globally for manual testing:

```bash
npm install -g @synapse-network-ai/mcp-server
synapse-mcp-server --help
```

Required credential:

```bash
export SYNAPSE_AGENT_KEY=agt_xxx
```

Optional runtime settings:

```bash
export SYNAPSE_ENV=prod           # prod for production workflows; staging is for preview/E2E
export SYNAPSE_GATEWAY_URL=...    # advanced custom Gateway override
export SYNAPSE_TIMEOUT_MS=30000
```

Credential aliases are accepted for compatibility: `SYNAPSE_API_KEY` and `SYNAPSE_AGENT_TOKEN`. New integrations should use `SYNAPSE_AGENT_KEY`. Use `SYNAPSE_ENV=prod` for production Agent workflows. Use staging only for preview validation and live smoke tests.

## Claude Desktop

Add the server to `claude_desktop_config.json`:

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

Restart Claude Desktop. The agent should then see `discover_services`, `invoke_and_pay`, and `get_receipt`.

## Cursor

Add an MCP server with the same command and environment:

```json
{
  "command": "npx",
  "args": ["-y", "@synapse-network-ai/mcp-server"],
  "env": {
    "SYNAPSE_AGENT_KEY": "agt_xxx",
    "SYNAPSE_ENV": "prod"
  }
}
```

Once configured, ask Cursor to discover Synapse services before invoking paid APIs.

## MCP Tools

### `discover_services`

Searches SynapseNetwork services through:

```text
POST /api/v1/agent/discovery/search
```

Inputs:

- `query` optional natural-language service intent.
- `tags` optional tag filters.
- `limit` optional result limit, max 50.
- `sort` optional: `best_match`, `lowest_price`, `fastest`, `highest_reliability`.

Outputs include agent-facing service metadata, schemas, health, and pricing fields such as `priceUsdc` for fixed-price APIs or token-metered pricing fields for LLM services. Provider payout, ledger, internal routing, and settlement internals are not exposed.

### `invoke_and_pay`

Invokes a service through:

```text
POST /api/v1/agent/invoke
```

Inputs:

- `service_id` required service id from `discover_services`.
- `payload` required JSON payload for the provider service.
- `costUsdc` fixed-price USDC decimal string copied exactly from discovery.
- `idempotencyKey` stable task-level idempotency key.
- `maxCostUsdc` optional decimal string cap for token-metered or LLM services.
- `requestId` optional trace id.
- `responseMode` optional, usually `sync`.

For fixed-price APIs, `costUsdc` must match the discovered price. If the price is stale or copied incorrectly, Gateway returns `PRICE_MISMATCH`; rediscover and retry only if the user or task permits the current price.

For token-metered LLM services, omit `costUsdc` and pass `maxCostUsdc` when a budget cap is needed. Gateway remains the source of truth for holds, charges, risk, settlement, and receipts.

### `get_receipt`

Fetches invocation status and receipt through:

```text
GET /api/v1/agent/invocations/{invocation_id}
```

Input:

- `invocation_id` returned by `invoke_and_pay`.

Gateway enforces that the receipt belongs to the configured Agent Key.

## Agent Usage Rules

1. Call `discover_services` before `invoke_and_pay`.
2. For fixed-price APIs, copy the observed price into `costUsdc` exactly as a string.
3. Never convert USDC values to JavaScript numbers or floating-point values for business logic.
4. Provide a stable `idempotencyKey` for each task when possible.
5. After invocation, call `get_receipt` and inspect `status` and charged amount fields.
6. On `PRICE_MISMATCH`, rediscover and retry with the updated price only if permitted.
7. On balance, budget, credential, or forbidden errors, stop and ask the owner to fix Agent Key state.
8. Treat this MCP server as stateless across process restarts.

## Security Boundary

This package uses only an Agent Key:

```bash
SYNAPSE_AGENT_KEY=agt_xxx
```

It must never request, store, log, document, or generate code that asks for:

- Owner private keys or seed phrases.
- Owner JWTs or wallet signing authority.
- Provider secrets or provider setup permissions.
- Admin credentials or internal service tokens.
- Deposit, withdrawal, refund, or settlement permissions.

If an issue, PR, prompt, or generated snippet asks for any of those capabilities, treat it as out of scope for this MCP server.

## E2E Verification

The default open-source verification path does not require credentials or a Synapse Gateway.

Protocol-only E2E with a mock Gateway:

```bash
npm run verify:mcp
```

This checks type safety, unit tests, build output, MCP stdio tool discovery, and the full mock flow:

```text
discover_services -> invoke_and_pay -> get_receipt
```

### Preview And Staging E2E

Use staging only for preview validation and live E2E smoke tests. Do not use staging for production Agent workflows.

```bash
export SYNAPSE_ENV=staging

npm run test:e2e:staging
```

For SynapseNetwork maintainers, staging E2E reads `SYNAPSE_AGENT_KEY` from Google Secret Manager by default using the `synapse-staging-e2e-agent-credential` secret. Set `SYNAPSE_E2E_SECRET_PROJECT` when the active `gcloud` project is not the staging secrets project.

Developers who are not using SynapseNetwork's GCP project can force a local Agent Key:

```bash
export SYNAPSE_E2E_AGENT_KEY_SOURCE=env
export SYNAPSE_AGENT_KEY=agt_xxx
export SYNAPSE_ENV=staging

npm run test:e2e:staging
```

By default, staging E2E performs broad discovery with `sort=lowest_price`, then selects a free fixed-price service by inspecting price fields. `SYNAPSE_E2E_QUERY` is optional and should be a real service intent such as `oss`, `weather`, or `sentiment`, not a price filter. The script refuses paid invokes unless explicitly allowed.

Specified staging service:

```bash
export SYNAPSE_ENV=staging
export SYNAPSE_E2E_SERVICE_ID=svc_quotes_famous_top3
export SYNAPSE_E2E_PAYLOAD_JSON='{"topic":"agent payments"}'
export SYNAPSE_E2E_COST_USDC='0.000000'

npm run test:e2e:staging
```

Token-metered staging service:

```bash
export SYNAPSE_ENV=staging
export SYNAPSE_E2E_SERVICE_ID=svc_deepseek_chat
export SYNAPSE_E2E_PAYLOAD_JSON='{"messages":[{"role":"user","content":"hello"}],"max_tokens":32}'
export SYNAPSE_E2E_MAX_COST_USDC='0.100000'

npm run test:e2e:staging
```

### Production E2E

Production E2E requires a production Agent Key, must be run intentionally, and must not run in default CI.

```bash
export SYNAPSE_AGENT_KEY=agt_prod_xxx
export SYNAPSE_ENV=prod
export SYNAPSE_E2E_SERVICE_ID=svc_prod_smoke
export SYNAPSE_E2E_COST_USDC='0.000000'

npm run test:e2e:prod
```

## Troubleshooting

`Missing Synapse agent key`: set `SYNAPSE_AGENT_KEY=agt_xxx` in the MCP client environment.

`SYNAPSE_AGENT_KEY must start with agt_`: use an Agent runtime credential, not an owner token or wallet secret.

`PRICE_MISMATCH`: call `discover_services` again and copy the current price string into `costUsdc`.

`INSUFFICIENT_BALANCE`, budget, or credential errors: stop and ask the owner to adjust funding, budget, or Agent Key settings.

No services in staging discovery during preview testing: confirm the Agent Key can access staging and try a broader query or no query.

Tool does not appear in the MCP client: run `npm run build`, restart the MCP client, and confirm the configured command uses `npx -y @synapse-network-ai/mcp-server` or the built `dist/index.js`.

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

CI runs `npm run verify:mcp`, `npm run smoke:cli`, `npm run ci:quality`, and `npm pack --dry-run`.

Quality gates enforce named public object return contracts, size budgets, complexity budgets, duplicate-code detection, and justified suppression comments. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full contributor workflow.

## Open Source Community

- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- Security policy: [SECURITY.md](SECURITY.md)
- Support: [SUPPORT.md](SUPPORT.md)
- Code of conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- Changelog: [CHANGELOG.md](CHANGELOG.md)
- License: [MIT](LICENSE)

## MCP Registry Publishing

The repo includes `server.json` for the MCP Registry publisher flow. After publishing the npm package:

```bash
mcp-publisher login github
mcp-publisher publish
```

The registry hosts metadata; npm hosts the package artifact.
