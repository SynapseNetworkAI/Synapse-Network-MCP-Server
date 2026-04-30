## Summary

Describe the change and why it helps developers, MCP clients, or agents.

## Verification

- [ ] `npm run verify:mcp`
- [ ] `npm run ci:quality`
- [ ] `npm run smoke:cli`
- [ ] `npm pack --dry-run`

## Security Boundary

- [ ] This keeps the MCP server stateless.
- [ ] This does not add owner/admin/provider control-plane tools.
- [ ] This does not request owner private keys, owner JWTs, provider secrets, admin credentials, deposits, withdrawals, refunds, or settlement permissions.
- [ ] Money values remain strings at all public boundaries.

## Documentation

- [ ] README, `llms.txt`, or `llm-instructions.md` updated if agent-facing behavior changed.
- [ ] No examples include real credentials or secrets.
