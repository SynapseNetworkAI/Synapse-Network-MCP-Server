import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig, loadRemoteServerConfig, resolveGatewayUrl } from "../src/config.js";

describe("config", () => {
  it("defaults to staging and reads SYNAPSE_AGENT_KEY", () => {
    expect(loadConfig({ SYNAPSE_AGENT_KEY: "agt_test" })).toEqual({
      agentKey: "agt_test",
      gatewayUrl: "https://api-staging.synapse-network.ai",
      timeoutMs: 30_000
    });
  });

  it("allows explicit gateway url override", () => {
    expect(resolveGatewayUrl({ SYNAPSE_GATEWAY_URL: "http://127.0.0.1:8000/" })).toBe("http://127.0.0.1:8000");
  });

  it("rejects non-agent credentials", () => {
    expect(() => loadConfig({ SYNAPSE_AGENT_KEY: "owner_jwt" })).toThrow(ConfigError);
  });

  it("loads hosted Remote MCP defaults without requiring an env Agent Key in agent_key mode", () => {
    expect(loadRemoteServerConfig({})).toMatchObject({
      authMode: "agent_key",
      gatewayUrl: "https://api.synapse-network.ai",
      host: "127.0.0.1",
      port: 3000,
      publicBaseUrl: "https://mcp.synapse-network.ai",
      oauthAudience: "https://mcp.synapse-network.ai/mcp",
      allowedHosts: expect.arrayContaining(["mcp.synapse-network.ai", "127.0.0.1", "localhost"])
    });
  });

  it("requires OAuth issuer, JWKS, and downstream Agent Key in Remote MCP oauth mode", () => {
    expect(() =>
      loadRemoteServerConfig({
        SYNAPSE_REMOTE_AUTH_MODE: "oauth",
        SYNAPSE_AGENT_KEY: "agt_test",
        SYNAPSE_OAUTH_ISSUER: "https://auth.synapse-network.ai"
      })
    ).toThrow(ConfigError);
  });

  it("loads Synapse OAuth mode without a platform Agent Key", () => {
    expect(
      loadRemoteServerConfig({
        SYNAPSE_REMOTE_AUTH_MODE: "synapse_oauth",
        SYNAPSE_OAUTH_ISSUER: "https://www.synapse-network.ai",
        SYNAPSE_OAUTH_JWT_SECRET: "test-secret"
      })
    ).toMatchObject({
      authMode: "synapse_oauth",
      downstreamAgentKey: undefined,
      oauthIssuer: "https://www.synapse-network.ai",
      oauthAudience: "https://mcp.synapse-network.ai/mcp"
    });
  });
});
