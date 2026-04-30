# Support

Use GitHub Issues for support, bug reports, feature requests, and MCP client compatibility questions:

https://github.com/cliff-personal/Synapse-Network-MCP-Server/issues

For useful support, include:

- Package version.
- Node.js version.
- MCP client, such as Claude Desktop, Cursor, Devin, or a framework client.
- `SYNAPSE_ENV`, usually `staging` or `prod`.
- The tool you called: `discover_services`, `invoke_and_pay`, or `get_receipt`.
- Sanitized error output.

Do not include real Agent Keys, owner private keys, owner JWTs, provider secrets, admin credentials, or wallet seed phrases.

Live staging and production E2E require a valid SynapseNetwork Agent Key. Protocol-only verification does not require credentials:

```bash
npm run verify:mcp
```
