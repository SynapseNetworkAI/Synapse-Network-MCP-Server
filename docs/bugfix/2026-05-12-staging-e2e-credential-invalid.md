# Staging MCP E2E Credential Blocked

- Date: 2026-05-12
- Environment profile: staging
- Command: `SYNAPSE_ENV=staging SYNAPSE_E2E_SERVICE_ID=svc_synapse_echo SYNAPSE_E2E_PAYLOAD_JSON='{"message":"mcp staging e2e","source":"synapse-mcp-server"}' SYNAPSE_E2E_COST_USDC='0.000000' npm run test:e2e:staging`
- Status: fixed on 2026-05-13

## Sanitized Failure

The MCP server started over stdio, listed tools, discovered `svc_synapse_echo`, and selected it for invocation.

`invoke_and_pay` failed with:

```json
{
  "status": 401,
  "code": "CREDENTIAL_INVALID",
  "message": "Credential is invalid"
}
```

A second run mapped the locally configured legacy `SYNAPSE_API_KEY` value into `SYNAPSE_AGENT_KEY`; it failed with the same sanitized Gateway error.

After updating staging E2E to read `SYNAPSE_AGENT_KEY` from Google Secret Manager secret `synapse-staging-e2e-agent-credential`, the MCP server again started over stdio, listed tools, discovered `svc_synapse_echo`, and selected it for invocation.

`invoke_and_pay` then failed with:

```json
{
  "status": 401,
  "code": "CREDENTIAL_INACTIVE",
  "message": "Credential is inactive"
}
```

## Root Cause

The current local Agent Key candidates are not accepted by the staging Gateway for paid invocation, and the Secret Manager-backed staging E2E credential is inactive in Gateway. The MCP adapter is still forwarding the credential as `X-Credential`; local unit tests and mock E2E cover this request construction.

Secret Manager checks confirmed that `synapse-staging-e2e-agent-credential` exists and its latest version is enabled. The remaining issue is Gateway credential lifecycle state, not Secret Manager access.

## Fix Summary

- Hardened live MCP E2E stdio child-process env handling so owner/provider/admin/private-key environment variables are not inherited by the MCP server process.
- Added a regression test proving sensitive Synapse owner/provider/admin variables are dropped.
- Added this bugfix record directory for live E2E failures.
- Updated staging E2E to read its maintainer Agent Key from Secret Manager by default.

## Verification Completed

```bash
npm test
npm run verify:mcp
npm run ci:quality
npm run smoke:cli
npm pack --dry-run
SYNAPSE_E2E_AGENT_KEY_SOURCE=secret SYNAPSE_ENV=staging SYNAPSE_E2E_SERVICE_ID=svc_synapse_echo SYNAPSE_E2E_PAYLOAD_JSON='{"message":"mcp staging e2e","source":"synapse-mcp-server"}' SYNAPSE_E2E_COST_USDC='0.000000' npm run test:e2e:staging
```

## Required Follow-Up

The staging Agent Key stored in Secret Manager secret `synapse-staging-e2e-agent-credential` was rotated by issuing a new dedicated credential named `mcp-staging-e2e-<timestamp>` and writing it as a new Secret Manager version.

Final rerun:

```bash
SYNAPSE_E2E_AGENT_KEY_SOURCE=secret \
SYNAPSE_ENV=staging \
SYNAPSE_E2E_SERVICE_ID=svc_synapse_echo \
SYNAPSE_E2E_PAYLOAD_JSON='{"message":"mcp staging e2e","source":"synapse-mcp-server"}' \
SYNAPSE_E2E_COST_USDC='0.000000' \
npm run test:e2e:staging
```

Result:

```text
Live MCP staging E2E credential source: secret-manager:synapse-staging-e2e-agent-credential
Live MCP staging E2E selected service: svc_synapse_echo
Live MCP staging E2E passed: svc_synapse_echo -> inv-<redacted> -> SUCCEEDED
```

The MCP staging live E2E release gate is unblocked.
