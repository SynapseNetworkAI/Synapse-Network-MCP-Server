# MCP And Skills Registration Launch Plan

This document is the canonical registration checklist for the official SynapseNetwork MCP Server.

Use production by default for every public listing. Staging is only for preview and live E2E smoke validation.

## Canonical Metadata

- Product name: SynapseNetwork MCP Server
- Positioning: Official stateless MCP server for SynapseNetwork agent payments
- Website: https://www.synapse-network.ai/
- GitHub repository: https://github.com/SynapseNetworkAI/Synapse-Network-MCP-Server
- npm package: `@synapse-network-ai/mcp-server`
- MCP registry name: `io.github.synapsenetworkai/synapse-network-mcp-server`
- Transport: stdio
- Install command: `npx -y @synapse-network-ai/mcp-server`
- Required credential: `SYNAPSE_AGENT_KEY=agt_xxx`
- Production environment: `SYNAPSE_ENV=prod`
- Tools: `discover_services`, `invoke_and_pay`, `get_receipt`
- Category keywords: payments, API monetization, agent commerce, USDC micropayments, service discovery, receipts

Short description:

> Official stateless MCP stdio server for SynapseNetwork. It lets agents discover external APIs, invoke services, pay through SynapseNetwork Gateway, and retrieve auditable receipts with an Agent Key.

Security boundary:

> The server uses only `SYNAPSE_AGENT_KEY`. It never requests owner private keys, seed phrases, owner JWTs, provider secrets, admin credentials, deposits, withdrawals, refunds, settlement controls, or provider setup permissions.

## P0 Official Distribution

Publish the package and official MCP Registry entry first. Directory submissions should not happen until the npm package is public and the production smoke path is verified.

```bash
npm run release:readiness
npm publish --access public --registry=https://registry.npmjs.org
npm view @synapse-network-ai/mcp-server --registry=https://registry.npmjs.org
npx -y @synapse-network-ai/mcp-server --help
mcp-publisher login github
mcp-publisher publish
```

Acceptance checks:

- npm resolves `@synapse-network-ai/mcp-server`.
- `npx -y @synapse-network-ai/mcp-server --help` exits successfully.
- Official MCP Registry shows `io.github.synapsenetworkai/synapse-network-mcp-server`.
- Production E2E evidence is recorded without secrets or full runtime IDs.

## P1 MCP Directories

Submit the same canonical metadata to these discovery surfaces:

- Official MCP Registry: publish `server.json` with `mcp-publisher`.
- Smithery: submit GitHub/npm metadata for stdio packages; use remote MCP only if the listing requires a hosted URL.
- PulseMCP: submit GitHub repository, npm package, tool list, website, and security boundary.
- Glama MCP Directory: submit GitHub repository so the directory can index tools and schemas.
- mcp.so / MCP.so: submit the GitHub repository and npm package.
- awesome-mcp-servers and similar community lists: submit a PR under payments, agent commerce, or API monetization.

Do not describe staging as the default runtime in public directory listings.

## Client Configuration Snippets

Claude Desktop / Cursor style stdio config:

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

VS Code / GitHub Copilot workspace-style config:

```json
{
  "servers": {
    "synapse-agentpay": {
      "type": "stdio",
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

Windsurf / Cline / Roo Code / Zed / Devin listings should use the same command, arguments, and environment variables when they support stdio MCP servers.

## Skills And Rules

MCP tools are the runtime capability surface. Skills and rules are optional instruction packs that help agents use the tools correctly.

Ship and reference these files:

- `skills/claude/synapse-agentpay/SKILL.md`: Claude Skill package.
- `skills/cursor/synapse-agentpay.mdc`: Cursor rule template.
- `skills/codex/synapse-agentpay/SKILL.md`: Codex skill package.

These skills must teach agents to:

- Use production configuration for production user requests.
- Call `discover_services -> invoke_and_pay -> get_receipt`.
- Keep all money fields as strings.
- Copy fixed-price `costUsdc` exactly from discovery.
- Use `maxCostUsdc` for token-metered services when a cap is needed.
- Rediscover on `PRICE_MISMATCH`.
- Stop on credential, budget, balance, or forbidden errors.
- Never request owner/admin/provider/private-key capabilities.

## P2 Remote MCP

The npm package remains a stdio MCP server for local clients. Remote MCP is a separate hosted distribution channel served by `synapse-mcp-http` / `npm run start:http`.

Use Remote MCP when targeting cloud-hosted agents and app stores that require a public URL, such as OpenAI Remote MCP / Apps SDK, Claude MCP connector, or managed-agent remote connector flows.

Canonical hosted endpoints:

```text
https://mcp.synapse-network.ai/mcp
https://mcp.synapse-network.ai/mcp/sse
```

Remote MCP requirements:

- Streamable HTTP transport on `/mcp`.
- Legacy HTTP+SSE compatibility on `/mcp/sse` and `/mcp/messages`.
- Agent Key smoke mode or OAuth bearer-token authentication.
- Public unauthenticated `/healthz` and `/readyz` probes.
- Per-agent rate limits and request audit logs.
- Production smoke tests independent of local `npx` execution, including OpenAI and Claude connector smoke scripts.
- Same three tools and same stateless pricing behavior as the stdio server.
- No token passthrough: OpenAI, Claude, and OAuth tokens are validated at Remote MCP and mapped to Gateway `X-Credential`.
- Paid `invoke_and_pay` examples must recommend human approval unless the selected provider is an explicit free smoke service.

Remote MCP must not replace the npm stdio package; it is an additional distribution channel.

## Pre-Submission Checklist

Before every public submission:

```bash
npm run release:readiness
SYNAPSE_AGENT_KEY=agt_prod_xxx SYNAPSE_ENV=prod npm run test:e2e:prod
```

Manual review:

- Public examples use `SYNAPSE_ENV=prod`.
- Staging appears only in preview/E2E context.
- No local Gateway instructions are exposed as the public install path.
- No owner private key, seed phrase, owner JWT, provider secret, admin credential, deposit, withdrawal, refund, settlement, or provider setup examples exist.
- Directory copy links to https://www.synapse-network.ai/ and the GitHub repository.
