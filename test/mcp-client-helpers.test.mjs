import { describe, expect, it } from "vitest";

import { buildMcpChildEnv } from "../scripts/e2e/mcp-client-helpers.mjs";

describe("buildMcpChildEnv", () => {
  it("passes only MCP runtime env and drops owner/provider/admin secrets", () => {
    const childEnv = buildMcpChildEnv(
      {
        SYNAPSE_AGENT_KEY: "agt_test",
        SYNAPSE_ENV: "staging",
        SYNAPSE_GATEWAY_URL: "https://api-staging.synapse-network.ai",
        SYNAPSE_TIMEOUT_MS: "60000",
        SYNAPSE_CONSUMER_OWNER_PRIVATE_KEY: "owner-secret-from-overrides",
        SYNAPSE_PROVIDER_OWNER_PRIVATE_KEY: "provider-secret-from-overrides",
        SYNAPSE_ADMIN_SECRET: "admin-secret-from-overrides"
      },
      {
        PATH: "/usr/bin",
        HOME: "/tmp/test-home",
        SYNAPSE_API_KEY: "legacy-agent-key",
        SYNAPSE_CONSUMER_OWNER_PRIVATE_KEY: "owner-secret",
        SYNAPSE_PROVIDER_OWNER_PRIVATE_KEY: "provider-secret",
        SYNAPSE_OWNER_JWT: "owner-jwt",
        SYNAPSE_PROVIDER_SECRET: "provider-secret",
        SYNAPSE_ADMIN_CREDENTIAL: "admin-credential",
        SYNAPSE_E2E_SERVICE_ID: "svc_synapse_echo",
        RANDOM_ENV: "random"
      }
    );

    expect(childEnv).toMatchObject({
      PATH: "/usr/bin",
      HOME: "/tmp/test-home",
      SYNAPSE_AGENT_KEY: "agt_test",
      SYNAPSE_ENV: "staging",
      SYNAPSE_GATEWAY_URL: "https://api-staging.synapse-network.ai",
      SYNAPSE_TIMEOUT_MS: "60000",
      SYNAPSE_E2E_SERVICE_ID: "svc_synapse_echo"
    });
    expect(childEnv).not.toHaveProperty("SYNAPSE_API_KEY");
    expect(childEnv).not.toHaveProperty("SYNAPSE_CONSUMER_OWNER_PRIVATE_KEY");
    expect(childEnv).not.toHaveProperty("SYNAPSE_PROVIDER_OWNER_PRIVATE_KEY");
    expect(childEnv).not.toHaveProperty("SYNAPSE_OWNER_JWT");
    expect(childEnv).not.toHaveProperty("SYNAPSE_PROVIDER_SECRET");
    expect(childEnv).not.toHaveProperty("SYNAPSE_ADMIN_CREDENTIAL");
    expect(childEnv).not.toHaveProperty("SYNAPSE_ADMIN_SECRET");
    expect(childEnv).not.toHaveProperty("RANDOM_ENV");
  });
});
