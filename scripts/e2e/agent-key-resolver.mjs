import { execFileSync } from "node:child_process";

export const DEFAULT_STAGING_AGENT_KEY_SECRET = "synapse-staging-e2e-agent-credential";

export function resolveLiveAgentKey(profile, env = process.env, secretReader = readGcloudSecret) {
  if (profile !== "staging" || env.SYNAPSE_E2E_AGENT_KEY_SOURCE === "env") {
    return agentKeyFromEnv(env);
  }

  const secretName = env.SYNAPSE_E2E_AGENT_KEY_SECRET?.trim() || DEFAULT_STAGING_AGENT_KEY_SECRET;
  const projectId = env.SYNAPSE_E2E_SECRET_PROJECT?.trim() || env.GCP_PROJECT_ID?.trim() || env.GOOGLE_CLOUD_PROJECT?.trim();
  try {
    const agentKey = secretReader(secretName, projectId);
    validateAgentKey(agentKey);
    return { agentKey, source: `secret-manager:${secretName}` };
  } catch (error) {
    if (env.SYNAPSE_E2E_AGENT_KEY_SOURCE === "secret") {
      throw new Error(`Unable to read staging Agent Key from Secret Manager secret '${secretName}': ${errorMessage(error)}`);
    }
    return agentKeyFromEnv(env);
  }
}

function agentKeyFromEnv(env) {
  const agentKey = env.SYNAPSE_AGENT_KEY?.trim();
  if (!agentKey) throw new Error("SYNAPSE_AGENT_KEY=agt_xxx is required for live MCP E2E.");
  validateAgentKey(agentKey);
  return { agentKey, source: "env:SYNAPSE_AGENT_KEY" };
}

function validateAgentKey(agentKey) {
  if (!agentKey.startsWith("agt_")) {
    throw new Error("SYNAPSE_AGENT_KEY must start with agt_.");
  }
}

function readGcloudSecret(secretName, projectId) {
  const args = ["secrets", "versions", "access", "latest", `--secret=${secretName}`];
  if (projectId) args.push(`--project=${projectId}`);
  return execFileSync("gcloud", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
