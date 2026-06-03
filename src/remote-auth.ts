import { createHash, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { ServerConfig, RemoteServerConfig } from "./config.js";
import { SynapseGatewayClient, type DiscoverServicesArgs, type GetReceiptArgs, type InvokeAndPayArgs } from "./gateway.js";

const ALL_REMOTE_SCOPES = ["synapse.discovery.read", "synapse.invocations.write", "synapse.receipts.read"];

export interface RemoteAuthContext {
  serverConfig: ServerConfig;
  tokenFingerprint: string;
  scopes: string[];
}

export class RemoteAuthError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "RemoteAuthError";
  }
}

export async function resolveRemoteAuthContext(authHeader: string | undefined, config: RemoteServerConfig): Promise<RemoteAuthContext> {
  const bearerToken = parseBearerToken(authHeader);
  if (config.authMode === "oauth") return resolveOauthContext(bearerToken, config);
  if (config.authMode === "synapse_oauth") return resolveSynapseOauthContext(bearerToken, config);
  return resolveAgentKeyContext(bearerToken, config);
}

export class ScopedSynapseGatewayClient extends SynapseGatewayClient {
  constructor(
    config: ServerConfig,
    private readonly scopes: readonly string[]
  ) {
    super(config);
  }

  async discoverServices(args: DiscoverServicesArgs): Promise<unknown> {
    this.requireScope("synapse.discovery.read");
    return super.discoverServices(args);
  }

  async invokeAndPay(args: InvokeAndPayArgs): Promise<unknown> {
    this.requireScope("synapse.invocations.write");
    return super.invokeAndPay(args);
  }

  async getReceipt(args: GetReceiptArgs): Promise<unknown> {
    this.requireScope("synapse.receipts.read");
    return super.getReceipt(args);
  }

  private requireScope(scope: string): void {
    if (!this.scopes.includes(scope)) {
      throw new RemoteAuthError(403, "INSUFFICIENT_SCOPE", `Remote MCP token is missing required scope: ${scope}.`);
    }
  }
}

function parseBearerToken(authHeader: string | undefined): string {
  const match = authHeader?.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token) {
    throw new RemoteAuthError(401, "AUTH_REQUIRED", "Remote MCP requires Authorization: Bearer <token>.");
  }
  return token;
}

function resolveAgentKeyContext(bearerToken: string, config: RemoteServerConfig): RemoteAuthContext {
  if (config.remoteBearerToken && config.downstreamAgentKey && constantTimeEqual(bearerToken, config.remoteBearerToken)) {
    return authContext(config.downstreamAgentKey, config, fingerprint(bearerToken), ALL_REMOTE_SCOPES);
  }
  if (bearerToken.startsWith("agt_")) {
    return authContext(bearerToken, config, fingerprint(bearerToken), ALL_REMOTE_SCOPES);
  }
  throw new RemoteAuthError(401, "INVALID_TOKEN", "Remote MCP bearer token is not accepted in agent_key mode.");
}

async function resolveOauthContext(bearerToken: string, config: RemoteServerConfig): Promise<RemoteAuthContext> {
  const issuer = required(config.oauthIssuer, "SYNAPSE_OAUTH_ISSUER");
  const jwksUrl = required(config.oauthJwksUrl, "SYNAPSE_OAUTH_JWKS_URL");
  const downstreamAgentKey = required(config.downstreamAgentKey, "SYNAPSE_AGENT_KEY");
  const audience = required(config.oauthAudience, "SYNAPSE_OAUTH_AUDIENCE");
  const { payload } = await jwtVerify(bearerToken, createRemoteJWKSet(new URL(jwksUrl)), {
    issuer,
    audience
  });
  return authContext(downstreamAgentKey, config, fingerprint(bearerToken), scopesFromClaim(payload.scope));
}

async function resolveSynapseOauthContext(bearerToken: string, config: RemoteServerConfig): Promise<RemoteAuthContext> {
  const issuer = required(config.oauthIssuer, "SYNAPSE_OAUTH_ISSUER");
  const jwtSecret = required(config.oauthJwtSecret, "SYNAPSE_OAUTH_JWT_SECRET");
  const audience = required(config.oauthAudience, "SYNAPSE_OAUTH_AUDIENCE");
  const secretKey = new TextEncoder().encode(jwtSecret);
  const { payload } = await jwtVerify(bearerToken, secretKey, {
    issuer,
    audience
  });
  if (payload.token_use !== "synapse_mcp_access") {
    throw new RemoteAuthError(401, "INVALID_TOKEN", "Remote MCP OAuth token use is invalid.");
  }
  return {
    serverConfig: {
      oauthAccessToken: bearerToken,
      gatewayUrl: config.gatewayUrl,
      timeoutMs: config.timeoutMs
    },
    tokenFingerprint: fingerprint(bearerToken),
    scopes: scopesFromClaim(payload.scope)
  };
}

function authContext(agentKey: string, config: RemoteServerConfig, tokenFingerprint: string, scopes: string[]): RemoteAuthContext {
  return {
    serverConfig: {
      agentKey,
      gatewayUrl: config.gatewayUrl,
      timeoutMs: config.timeoutMs
    },
    tokenFingerprint,
    scopes
  };
}

function scopesFromClaim(scope: unknown): string[] {
  if (typeof scope !== "string" || !scope.trim()) return [];
  return scope.split(/\s+/).filter(Boolean);
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new RemoteAuthError(500, "REMOTE_AUTH_MISCONFIGURED", `${name} is required.`);
  return value;
}

function fingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

function constantTimeEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
