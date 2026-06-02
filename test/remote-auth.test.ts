import { describe, expect, it } from "vitest";
import type { RemoteServerConfig } from "../src/config.js";
import { RemoteAuthError, resolveRemoteAuthContext, ScopedSynapseGatewayClient } from "../src/remote-auth.js";

const baseConfig: RemoteServerConfig = {
  gatewayUrl: "http://gateway.test",
  timeoutMs: 30_000,
  host: "127.0.0.1",
  port: 3000,
  publicBaseUrl: "https://mcp.synapse-network.ai",
  authMode: "agent_key",
  downstreamAgentKey: "agt_downstream",
  remoteBearerToken: "remote_token",
  oauthIssuer: undefined,
  oauthJwksUrl: undefined,
  oauthAudience: "https://mcp.synapse-network.ai/mcp",
  allowedHosts: ["mcp.synapse-network.ai"],
  allowedOrigins: [],
  sseSessionTtlMs: 900_000
};

describe("remote auth", () => {
  it("accepts customer Agent Key bearer tokens in public mode", async () => {
    const context = await resolveRemoteAuthContext("Bearer agt_customer", {
      ...baseConfig,
      downstreamAgentKey: undefined,
      remoteBearerToken: undefined
    });

    expect(context.serverConfig).toMatchObject({
      agentKey: "agt_customer",
      gatewayUrl: "http://gateway.test"
    });
    expect(context.scopes).toEqual(["synapse.discovery.read", "synapse.invocations.write", "synapse.receipts.read"]);
  });

  it("still supports an explicit single-tenant opaque token mapping when configured", async () => {
    const context = await resolveRemoteAuthContext("Bearer remote_token", baseConfig);

    expect(context.serverConfig.agentKey).toBe("agt_downstream");
    expect(context.tokenFingerprint).toHaveLength(16);
  });

  it("rejects missing bearer auth", async () => {
    await expect(resolveRemoteAuthContext(undefined, baseConfig)).rejects.toMatchObject({
      status: 401,
      code: "AUTH_REQUIRED"
    } satisfies Partial<RemoteAuthError>);
  });

  it("enforces tool scopes before Gateway calls", async () => {
    const client = new ScopedSynapseGatewayClient(
      {
        agentKey: "agt_test",
        gatewayUrl: "http://gateway.test",
        timeoutMs: 30_000
      },
      ["synapse.discovery.read"]
    );

    await expect(client.invokeAndPay({ service_id: "svc_1", payload: {} })).rejects.toMatchObject({
      status: 403,
      code: "INSUFFICIENT_SCOPE"
    } satisfies Partial<RemoteAuthError>);
  });
});
