import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig, resolveGatewayUrl } from "../src/config.js";

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
});
