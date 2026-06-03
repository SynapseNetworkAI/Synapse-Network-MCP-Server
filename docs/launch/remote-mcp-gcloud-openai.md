# Remote MCP GCloud And OpenAI Launch Runbook

This runbook deploys the hosted SynapseNetwork Remote MCP entrypoint to Google
Cloud Run and verifies that OpenAI can import the MCP tool list.

Production endpoint:

```text
https://mcp.synapse-network.ai/mcp
```

The hosted service exposes the same three stateless MCP tools as the local
stdio package:

```text
discover_services -> invoke_and_pay -> get_receipt
```

## 1. Build And Deploy

The public hosted endpoint is bring-your-own-Agent-Key. Do not configure
`SYNAPSE_AGENT_KEY` or `SYNAPSE_REMOTE_BEARER_TOKEN` on Cloud Run. Each customer
passes their own `agt_xxx` as the MCP bearer token, and Gateway charges that
customer's Agent balance.

Deploy to Cloud Run:

```bash
PROJECT_ID=<gcp-project-id> \
REGION=us-central1 \
SERVICE_NAME=synapse-prod-mcp-server \
DOMAIN=mcp.synapse-network.ai \
npm run deploy:gcloud:remote
```

The script builds this image shape:

```text
REGION-docker.pkg.dev/PROJECT_ID/synapse-prod/synapse-mcp-server:GIT_SHA
```

Cloud Run receives:

```text
PORT=8080
SYNAPSE_MCP_HTTP_HOST=0.0.0.0
SYNAPSE_MCP_PUBLIC_BASE_URL=https://mcp.synapse-network.ai
SYNAPSE_ENV=prod
SYNAPSE_GATEWAY_URL=https://api.synapse-network.ai
SYNAPSE_REMOTE_AUTH_MODE=agent_key
```

P0 keeps `--max-instances=1` because current remote sessions are in process
memory. Keep `/mcp` Streamable HTTP as the preferred OpenAI URL. If a legacy
client must use `/mcp/sse`, either keep max instances at one or deploy with
`ENABLE_SESSION_AFFINITY=1` and verify `/mcp/messages` affinity before raising
the instance count.

## 2. DNS And Public Probes

Map `mcp.synapse-network.ai` to the Cloud Run service through Cloud Run domain
mapping or an external HTTPS load balancer. To let the script create the domain
mapping when it does not exist:

```bash
PROJECT_ID=<gcp-project-id> CREATE_DOMAIN_MAPPING=1 npm run deploy:gcloud:remote
```

After DNS and TLS are live:

```bash
curl -fsS https://mcp.synapse-network.ai/healthz
curl -fsS https://mcp.synapse-network.ai/readyz

curl -i -X POST https://mcp.synapse-network.ai/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"unauth","version":"0"}}}'
```

The unauthenticated MCP request must return `401` with `WWW-Authenticate`
metadata. The public probes must not require Google IAM auth.

## 3. OpenAI Remote MCP Smoke

OpenAI Responses API uses a Remote MCP tool definition with `server_url` and an
authorization token. Use the customer's own Agent Key as the authorization
token. Use the Streamable HTTP endpoint:

```bash
SYNAPSE_REMOTE_MCP_URL=https://mcp.synapse-network.ai/mcp \
SYNAPSE_REMOTE_MCP_AUTH_TOKEN=agt_customer_xxx \
OPENAI_API_KEY=<openai-api-key> \
OPENAI_MODEL=gpt-5 \
npm run test:e2e:remote:openai
```

The smoke script imports only `discover_services` and asks OpenAI to discover a
free or lowest-price service. It must not invoke paid tools.

## 4. Security Boundary

- Remote clients send `Authorization: Bearer <token>` to the MCP layer.
- In public mode, `<token>` must be the customer's Agent Key beginning with
  `agt_`.
- OpenAI and Claude platform tokens are never forwarded to Synapse Gateway.
- In `agent_key` mode, Gateway receives the customer's Agent Key through
  `X-Credential`.
- In `synapse_oauth` mode, the MCP layer validates Synapse OAuth JWT issuer,
  audience, expiry, and scopes, then forwards the Synapse OAuth bearer token to
  Gateway. Gateway resolves it to the Agent Credential selected during
  `https://www.synapse-network.ai/oauth/authorize` consent.
- `SYNAPSE_OAUTH_JWT_SECRET` must be the same on Gateway and the Remote MCP
  Cloud Run service. It is a signing secret, not a customer Agent Key.
- Do not use owner private keys, seed phrases, owner JWTs, admin credentials,
  provider secrets, deposit permissions, withdrawal permissions, refund
  permissions, or settlement controls in this service.
