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

export type RemoteAuthMode = "agent_key" | "oauth";

export interface RemoteServerConfig {
  gatewayUrl: string;
  timeoutMs: number;
  host: string;
  port: number;
  publicBaseUrl: string;
  authMode: RemoteAuthMode;
  downstreamAgentKey: string | undefined;
  remoteBearerToken: string | undefined;
  oauthIssuer: string | undefined;
  oauthJwksUrl: string | undefined;
  oauthAudience: string | undefined;
  allowedHosts: string[];
  allowedOrigins: string[];
  sseSessionTtlMs: number;
}

export interface ConfigEnv {
  SYNAPSE_AGENT_KEY?: string;
  SYNAPSE_API_KEY?: string;
  SYNAPSE_AGENT_TOKEN?: string;
  SYNAPSE_GATEWAY_URL?: string;
  SYNAPSE_ENV?: string;
  SYNAPSE_TIMEOUT_MS?: string;
  SYNAPSE_MCP_HTTP_HOST?: string;
  SYNAPSE_MCP_HTTP_PORT?: string;
  PORT?: string;
  SYNAPSE_MCP_PUBLIC_BASE_URL?: string;
  SYNAPSE_REMOTE_AUTH_MODE?: string;
  SYNAPSE_REMOTE_BEARER_TOKEN?: string;
  SYNAPSE_OAUTH_ISSUER?: string;
  SYNAPSE_OAUTH_JWKS_URL?: string;
  SYNAPSE_OAUTH_AUDIENCE?: string;
  SYNAPSE_MCP_ALLOWED_HOSTS?: string;
  SYNAPSE_MCP_ALLOWED_ORIGINS?: string;
  SYNAPSE_MCP_SSE_SESSION_TTL_MS?: string;
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

export function loadRemoteServerConfig(env: ConfigEnv = process.env): RemoteServerConfig {
  const publicBaseUrl = trimTrailingSlash(env.SYNAPSE_MCP_PUBLIC_BASE_URL?.trim() || "https://mcp.synapse-network.ai");
  const authMode = resolveRemoteAuthMode(env.SYNAPSE_REMOTE_AUTH_MODE);
  const downstreamAgentKey = firstPresent(env.SYNAPSE_AGENT_KEY, env.SYNAPSE_API_KEY, env.SYNAPSE_AGENT_TOKEN);
  validateRemoteAuth(authMode, downstreamAgentKey, env);

  return {
    gatewayUrl: resolveGatewayUrl(env),
    timeoutMs: resolveTimeoutMs(env.SYNAPSE_TIMEOUT_MS),
    host: env.SYNAPSE_MCP_HTTP_HOST?.trim() || "127.0.0.1",
    port: resolvePort(env.SYNAPSE_MCP_HTTP_PORT || env.PORT),
    publicBaseUrl,
    authMode,
    downstreamAgentKey,
    remoteBearerToken: optionalTrim(env.SYNAPSE_REMOTE_BEARER_TOKEN),
    oauthIssuer: optionalTrim(env.SYNAPSE_OAUTH_ISSUER),
    oauthJwksUrl: optionalTrim(env.SYNAPSE_OAUTH_JWKS_URL),
    oauthAudience: optionalTrim(env.SYNAPSE_OAUTH_AUDIENCE) || `${publicBaseUrl}/mcp`,
    allowedHosts: resolveAllowedHosts(publicBaseUrl, env.SYNAPSE_MCP_ALLOWED_HOSTS),
    allowedOrigins: splitCsv(env.SYNAPSE_MCP_ALLOWED_ORIGINS),
    sseSessionTtlMs: resolveSessionTtlMs(env.SYNAPSE_MCP_SSE_SESSION_TTL_MS)
  };
}

function resolveTimeoutMs(raw: string | undefined): number {
  if (!raw?.trim()) return 30_000;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0 || value > 300_000) {
    throw new ConfigError("SYNAPSE_TIMEOUT_MS must be an integer between 1 and 300000.");
  }
  return value;
}

function resolvePort(raw: string | undefined): number {
  if (!raw?.trim()) return 3000;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0 || value > 65_535) {
    throw new ConfigError("SYNAPSE_MCP_HTTP_PORT/PORT must be an integer between 1 and 65535.");
  }
  return value;
}

function resolveSessionTtlMs(raw: string | undefined): number {
  if (!raw?.trim()) return 15 * 60_000;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 60_000 || value > 24 * 60 * 60_000) {
    throw new ConfigError("SYNAPSE_MCP_SSE_SESSION_TTL_MS must be an integer between 60000 and 86400000.");
  }
  return value;
}

function resolveRemoteAuthMode(raw: string | undefined): RemoteAuthMode {
  const value = raw?.trim() || "agent_key";
  if (value === "agent_key" || value === "oauth") return value;
  throw new ConfigError("SYNAPSE_REMOTE_AUTH_MODE must be agent_key or oauth.");
}

function validateRemoteAuth(authMode: RemoteAuthMode, downstreamAgentKey: string | undefined, env: ConfigEnv): void {
  if (downstreamAgentKey && !downstreamAgentKey.startsWith("agt_")) {
    throw new ConfigError("Remote MCP downstream SYNAPSE_AGENT_KEY must start with agt_.");
  }
  if (authMode === "oauth") {
    if (!downstreamAgentKey) throw new ConfigError("SYNAPSE_AGENT_KEY is required when SYNAPSE_REMOTE_AUTH_MODE=oauth.");
    if (!env.SYNAPSE_OAUTH_ISSUER?.trim()) throw new ConfigError("SYNAPSE_OAUTH_ISSUER is required when SYNAPSE_REMOTE_AUTH_MODE=oauth.");
    if (!env.SYNAPSE_OAUTH_JWKS_URL?.trim()) throw new ConfigError("SYNAPSE_OAUTH_JWKS_URL is required when SYNAPSE_REMOTE_AUTH_MODE=oauth.");
  }
}

function resolveAllowedHosts(publicBaseUrl: string, raw: string | undefined): string[] {
  const configured = splitCsv(raw);
  const publicHost = new URL(publicBaseUrl).host;
  return [...new Set([...configured, publicHost, "127.0.0.1", "localhost"])];
}

function splitCsv(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw.split(",").map((item) => item.trim()).filter(Boolean);
}

function firstPresent(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function optionalTrim(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
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
