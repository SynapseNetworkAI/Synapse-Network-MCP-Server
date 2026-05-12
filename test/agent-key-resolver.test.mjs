import { describe, expect, it } from "vitest";

import { DEFAULT_STAGING_AGENT_KEY_SECRET, resolveLiveAgentKey } from "../scripts/e2e/agent-key-resolver.mjs";

describe("resolveLiveAgentKey", () => {
  it("reads staging Agent Key from Secret Manager by default", () => {
    const calls = [];
    const result = resolveLiveAgentKey(
      "staging",
      {
        SYNAPSE_AGENT_KEY: "agt_env",
        GCP_PROJECT_ID: "project-a"
      },
      (secretName, projectId) => {
        calls.push({ secretName, projectId });
        return "agt_secret";
      }
    );

    expect(result).toEqual({
      agentKey: "agt_secret",
      source: `secret-manager:${DEFAULT_STAGING_AGENT_KEY_SECRET}`
    });
    expect(calls).toEqual([{ secretName: DEFAULT_STAGING_AGENT_KEY_SECRET, projectId: "project-a" }]);
  });

  it("allows an explicit staging secret name and project", () => {
    const result = resolveLiveAgentKey(
      "staging",
      {
        SYNAPSE_E2E_AGENT_KEY_SECRET: "custom-agent-key",
        SYNAPSE_E2E_SECRET_PROJECT: "project-b"
      },
      (secretName, projectId) => {
        expect(secretName).toBe("custom-agent-key");
        expect(projectId).toBe("project-b");
        return "agt_custom";
      }
    );

    expect(result).toEqual({ agentKey: "agt_custom", source: "secret-manager:custom-agent-key" });
  });

  it("can force env Agent Key for staging developer overrides", () => {
    const result = resolveLiveAgentKey(
      "staging",
      {
        SYNAPSE_E2E_AGENT_KEY_SOURCE: "env",
        SYNAPSE_AGENT_KEY: "agt_env"
      },
      () => {
        throw new Error("secret reader should not be called");
      }
    );

    expect(result).toEqual({ agentKey: "agt_env", source: "env:SYNAPSE_AGENT_KEY" });
  });

  it("falls back to env when auto secret lookup fails", () => {
    const result = resolveLiveAgentKey(
      "staging",
      {
        SYNAPSE_AGENT_KEY: "agt_env"
      },
      () => {
        throw new Error("gcloud unavailable");
      }
    );

    expect(result).toEqual({ agentKey: "agt_env", source: "env:SYNAPSE_AGENT_KEY" });
  });

  it("fails hard when secret source is required and Secret Manager lookup fails", () => {
    expect(() =>
      resolveLiveAgentKey(
        "staging",
        {
          SYNAPSE_AGENT_KEY: "agt_env",
          SYNAPSE_E2E_AGENT_KEY_SOURCE: "secret"
        },
        () => {
          throw new Error("permission denied");
        }
      )
    ).toThrow("Unable to read staging Agent Key from Secret Manager");
  });

  it("uses env for non-staging profiles", () => {
    const result = resolveLiveAgentKey(
      "prod",
      {
        SYNAPSE_AGENT_KEY: "agt_prod"
      },
      () => {
        throw new Error("secret reader should not be called");
      }
    );

    expect(result).toEqual({ agentKey: "agt_prod", source: "env:SYNAPSE_AGENT_KEY" });
  });
});
