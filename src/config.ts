export type SynapseEnvironment = "local" | "staging" | "prod";

const GATEWAY_URLS: Record<SynapseEnvironment, string> = {
  local: "http://127.0.0.1:8000",
  staging: "https://api-staging.synapse-network.ai",
  prod: "https://api.synapse-network.ai"
};

export interface ServerConfig {
  agentKey: string;
  gatewayUrl: string;
  timeoutMs: number;
}

export interface ConfigEnv {
  SYNAPSE_AGENT_KEY?: string;
  SYNAPSE_API_KEY?: string;
  SYNAPSE_AGENT_TOKEN?: string;
  SYNAPSE_GATEWAY_URL?: string;
  SYNAPSE_ENV?: string;
  SYNAPSE_TIMEOUT_MS?: string;
}

export function loadConfig(env: ConfigEnv = process.env): ServerConfig {
  const agentKey = firstPresent(env.SYNAPSE_AGENT_KEY, env.SYNAPSE_API_KEY, env.SYNAPSE_AGENT_TOKEN);
  if (!agentKey) {
    throw new ConfigError(
      "Missing Synapse agent key. Set SYNAPSE_AGENT_KEY=agt_xxx. The MCP server never uses owner private keys or owner JWTs."
    );
  }
  if (!agentKey.startsWith("agt_")) {
    throw new ConfigError("SYNAPSE_AGENT_KEY must be an agent runtime key that starts with agt_.");
  }

  return {
    agentKey,
    gatewayUrl: resolveGatewayUrl(env),
    timeoutMs: resolveTimeoutMs(env.SYNAPSE_TIMEOUT_MS)
  };
}

export function resolveGatewayUrl(env: Pick<ConfigEnv, "SYNAPSE_GATEWAY_URL" | "SYNAPSE_ENV"> = {}): string {
  const explicit = env.SYNAPSE_GATEWAY_URL?.trim();
  if (explicit) return trimTrailingSlash(explicit);

  const selected = (env.SYNAPSE_ENV?.trim() || "staging") as SynapseEnvironment;
  const url = GATEWAY_URLS[selected];
  if (!url) {
    throw new ConfigError("Unsupported SYNAPSE_ENV. Expected one of: staging, prod.");
  }
  return url;
}

function resolveTimeoutMs(raw: string | undefined): number {
  if (!raw?.trim()) return 30_000;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0 || value > 300_000) {
    throw new ConfigError("SYNAPSE_TIMEOUT_MS must be an integer between 1 and 300000.");
  }
  return value;
}

function firstPresent(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}
