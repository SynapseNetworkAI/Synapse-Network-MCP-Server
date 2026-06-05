# MCP And Skills Registration Launch Plan

This document is the canonical registration checklist for the official SynapseNetwork MCP Server.

Use production by default for every public listing. Staging is only for preview and live E2E smoke validation.

## Canonical Metadata

- Product name: SynapseNetwork MCP Server
- Positioning: Official stateless MCP server for SynapseNetwork agent payments
- Website: https://www.synapse-network.ai/
- GitHub repository: https://github.com/SynapseNetworkAI/Synapse-Network-MCP-Server
- npm package: `@synapse-network-ai/mcp-server`
- MCP registry name: `io.github.SynapseNetworkAI/synapse-network-mcp-server`
- Transport: stdio package plus hosted Remote MCP
- Install command: `npx -y @synapse-network-ai/mcp-server`
- Remote MCP endpoint: `https://mcp.synapse-network.ai/mcp`
- Required credential: `SYNAPSE_AGENT_KEY=agt_xxx`
- Remote MCP credential: `Authorization: Bearer agt_xxx`
- Production environment: `SYNAPSE_ENV=prod`
- Tools: `discover_services`, `invoke_and_pay`, `get_receipt`
- Category keywords: payments, API monetization, agent commerce, USDC micropayments, service discovery, receipts

Short description:

> Official stateless MCP server for SynapseNetwork. It lets agents discover external APIs, invoke services, pay through SynapseNetwork Gateway, and retrieve auditable receipts with an Agent Key. Use the npm stdio package for local MCP clients or the hosted Remote MCP endpoint for cloud-hosted agents.

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
- Official MCP Registry shows `io.github.SynapseNetworkAI/synapse-network-mcp-server`.
- Official MCP Registry metadata includes Remote MCP `https://mcp.synapse-network.ai/mcp`.
- Production E2E evidence is recorded without secrets or full runtime IDs.

## P1 MCP Directories

Submit the same canonical metadata to these discovery surfaces:

- Official MCP Registry: publish `server.json` with `mcp-publisher`.
- Smithery: publish/import `https://mcp.synapse-network.ai/mcp` when remote URL publishing is supported; otherwise submit GitHub/npm metadata.
- PulseMCP: submit GitHub repository, npm package, tool list, website, and security boundary.
- Glama MCP Directory: submit GitHub repository and verify the hosted URL with the Glama Inspector using a bearer Agent Key.
- mcp.so / MCP.so: submit the GitHub repository, npm package, and hosted Remote MCP URL when the form supports it.
- awesome-mcp-servers and similar community lists: submit a PR under payments, agent commerce, or API monetization.

Do not describe staging as the default runtime in public directory listings.

Use the reusable submission artifacts in this directory so listings stay
consistent across surfaces:

- `directory-submission-metadata.json`: machine-readable metadata for forms,
  scripts, and directory PRs.
- `directory-submission-copy.md`: human-readable copy blocks for directory
  descriptions, security notes, tool summaries, and category placement.

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
- Agent Key smoke mode or Synapse OAuth bearer-token authentication.
- Public unauthenticated `/healthz` and `/readyz` probes.
- Per-agent rate limits and request audit logs.
- Production smoke tests independent of local `npx` execution, including OpenAI and Claude connector smoke scripts.
- Same three tools and same stateless pricing behavior as the stdio server.
- No external token passthrough: OpenAI and Claude tokens are not sent to Gateway. Synapse first-party OAuth access tokens are allowed in `synapse_oauth` mode and resolve at Gateway to a linked Agent Credential.
- Paid `invoke_and_pay` examples must recommend human approval unless the selected provider is an explicit free smoke service.

Remote MCP must not replace the npm stdio package; it is an additional distribution channel.

## ChatGPT And Claude Remote Connector Registration

ChatGPT workspace custom app registration:

```text
MCP endpoint: https://mcp.synapse-network.ai/mcp
Authentication: Bearer/API token
Secret value: agt_xxx
Read-only smoke tool: discover_services
Consequential tool: invoke_and_pay, require human approval
```

ChatGPT Business, Enterprise, or Edu admins should enable developer mode, create
a custom app, scan tools, and publish only after verifying action controls. Do
not claim public ChatGPT app directory availability from this internal custom
app registration.

If the ChatGPT UI only accepts OAuth, use Synapse first-party OAuth:

```text
MCP endpoint: https://mcp.synapse-network.ai/mcp
Authentication: OAuth
Authorization endpoint: https://www.synapse-network.ai/oauth/authorize
Token endpoint: https://www.synapse-network.ai/oauth/token
Default scopes: synapse.discovery.read synapse.receipts.read offline_access
Write scope: synapse.invocations.write
```

The user signs in with Synapse wallet auth, selects or creates a dedicated
`ChatGPT Remote MCP` Agent Credential, and ChatGPT receives OAuth tokens only.
Gateway maps those tokens to the linked Agent Credential server-side.

Claude remote connectors can use the same URL and bearer Agent Key credential.
For local Claude Desktop, Cursor, VS Code, Windsurf, Devin, and similar clients,
continue to prefer the stdio `npx` configuration unless the client explicitly
supports Remote MCP over Streamable HTTP.

Production Cloud Run deployment and OpenAI Remote MCP smoke validation live in
[remote-mcp-gcloud-openai.md](remote-mcp-gcloud-openai.md). The P0 hosted
service should run as `synapse-prod-mcp-server`, publish
`https://mcp.synapse-network.ai/mcp`, keep `--max-instances=1` until remote
session storage or affinity is proven, and use public bring-your-own-Agent-Key
auth. Do not configure `SYNAPSE_AGENT_KEY` or `SYNAPSE_REMOTE_BEARER_TOKEN` on
the public Cloud Run service; customers pass their own `agt_xxx` as
`Authorization: Bearer agt_xxx`.

## Pre-Submission Checklist

Before every public submission:

```bash
npm run release:readiness
SYNAPSE_AGENT_KEY=agt_prod_xxx SYNAPSE_ENV=prod npm run test:e2e:prod
```

Manual review:

- Public examples use `SYNAPSE_ENV=prod`.
- Staging appears only in preview/E2E context.
- Remote MCP examples use `https://mcp.synapse-network.ai/mcp` and `Authorization: Bearer agt_xxx`.
- ChatGPT/Claude copy requires human approval for paid `invoke_and_pay`.
- No local Gateway instructions are exposed as the public install path.
- No owner private key, seed phrase, owner JWT, provider secret, admin credential, deposit, withdrawal, refund, settlement, or provider setup examples exist.
- Directory copy links to https://www.synapse-network.ai/ and the GitHub repository.
