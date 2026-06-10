# Contributing To Synapse Network MCP Server

Thanks for helping improve the official SynapseNetwork MCP server. This package is open source infrastructure for developers, Cursor, Claude Desktop, Devin, and agent frameworks.

## Development Setup

```bash
npm install
npm run typecheck
npm test
npm run build
npm run test:e2e:mock
npm run ci:quality
npm pack --dry-run
```

Use Node.js 20 or newer. Do not commit `dist/`, `node_modules/`, `.env*`, coverage output, or package tarballs.

## Pull Request Checklist

Before opening a PR:

- Keep the MCP server stateless.
- Use direct Gateway HTTP calls through native `fetch`.
- Do not import the Synapse SDK into this package.
- Keep money values as strings at all boundaries.
- Add or update tests for behavior changes.
- Run `npm run verify:mcp` and `npm run ci:quality`.
- Update `README.md`, `llms.txt`, or `llm-instructions.md` when agent-facing behavior changes.
- Update `docs/launch/mcp-and-skills-registration.md` and `skills/` when registry, directory, or Agent Skill behavior changes.

## Security Boundary

This MCP server is agent runtime only. Contributions must not add tools, docs, examples, or prompts that request owner private keys, seed phrases, owner JWTs, provider secrets, admin credentials, deposit permissions, withdrawal permissions, refund permissions, settlement controls, or provider setup permissions.

Only `SYNAPSE_AGENT_KEY=agt_xxx` belongs in runtime configuration examples.

## Agent Coding Rules

Public functions and public methods must return named object contracts. Do not return raw maps such as `dict`, `Dict[str, Any]`, `Record<string, unknown>`, or `Promise<Record<string, unknown>>` from public APIs.

Raw maps are allowed for private helpers, request bodies, patch inputs, schema/payload fields, and external JSON parsing boundaries.

Extract duplicated logic into shared helpers. Split large or complex functions before they exceed CI quality budgets. Suppression comments must include `quality-disable-reason: ...`.

## E2E Policy

Open-source verification is staging-first. The default contributor path is `npm run verify:mcp`, which includes mock MCP stdio E2E and does not require secrets or funds.

Live staging E2E requires an Agent Key:

```bash
export SYNAPSE_AGENT_KEY=agt_xxx
export SYNAPSE_ENV=staging
npm run test:e2e:staging
```

Production E2E is explicit-only and must not run in default CI.

## Issue And PR Etiquette

Use GitHub Issues for bugs, feature requests, and support questions. Include the package version, Node version, MCP client, environment, and sanitized error output. Never paste real Agent Keys or other credentials.
