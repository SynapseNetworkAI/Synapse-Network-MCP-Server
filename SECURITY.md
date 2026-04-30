# Security Policy

## Supported Versions

The current `0.x` line receives security fixes while the MCP server is pre-1.0.

## Reporting A Vulnerability

Use GitHub Security advisories if available for this repository. If advisories are not available, open a GitHub Issue with a minimal description and mark it as security-sensitive without including secrets, private keys, Agent Keys, or exploit-ready credential material.

Do not publish working exploits or leaked credentials in public issues or PRs.

## Runtime Security Boundary

This package is a stateless MCP adapter over Synapse Gateway agent APIs. It only needs an Agent Key:

```bash
SYNAPSE_AGENT_KEY=agt_xxx
```

It must never ask for or handle owner private keys, seed phrases, owner JWTs, provider secrets, admin credentials, internal service tokens, deposit permissions, withdrawal permissions, refund permissions, settlement controls, or provider setup permissions.

Gateway enforces credential ownership, pricing validation, settlement, budgets, risk checks, and receipt access. This MCP server should remain a transparent adapter.

## Secret Handling

Do not commit `.env*` files, logs containing credentials, generated tokens, wallet secrets, or provider/admin credentials. Redact Agent Keys in issues and logs.
