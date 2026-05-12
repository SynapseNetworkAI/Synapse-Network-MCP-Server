# Staging MCP E2E Evidence

- Date: 2026-05-13
- Environment: staging
- Credential source: Google Secret Manager `synapse-staging-e2e-agent-credential`
- Secret version used: latest after rotation
- Service: `svc_synapse_echo`
- Invocation: `inv-<redacted>`
- Receipt status: `SUCCEEDED`

## Command

```bash
SYNAPSE_E2E_AGENT_KEY_SOURCE=secret \
SYNAPSE_ENV=staging \
SYNAPSE_E2E_SERVICE_ID=svc_synapse_echo \
SYNAPSE_E2E_PAYLOAD_JSON='{"message":"mcp staging e2e","source":"synapse-mcp-server"}' \
SYNAPSE_E2E_COST_USDC='0.000000' \
npm run test:e2e:staging
```

## Result

```text
Live MCP staging E2E credential source: secret-manager:synapse-staging-e2e-agent-credential
Live MCP staging E2E selected service: svc_synapse_echo
Live MCP staging E2E passed: svc_synapse_echo -> inv-<redacted> -> SUCCEEDED
```

## Checks Covered

- MCP stdio server starts from built `dist/index.js`.
- MCP tool list includes `discover_services`, `invoke_and_pay`, and `get_receipt`.
- `discover_services` can find the staging smoke service.
- `invoke_and_pay` can invoke the staging smoke service using the Secret Manager Agent Key.
- `get_receipt` returns the same invocation id with a terminal success status.
- Money fields remain strings when present.
- E2E child-process environment is sanitized and does not inherit owner/provider/admin/private-key variables.

No Agent Key, owner private key, owner JWT, provider secret, admin credential, wallet seed, raw authorization header, or private Gateway payload is included in this evidence.
