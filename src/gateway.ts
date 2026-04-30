import { randomUUID } from "node:crypto";
import type { ServerConfig } from "./config.js";

export type DiscoverySort = "best_match" | "lowest_price" | "fastest" | "highest_reliability";
export type ResponseMode = "sync" | "async" | "stream";

export interface DiscoverServicesArgs {
  query?: string | undefined;
  tags?: string[] | undefined;
  limit?: number | undefined;
  sort?: DiscoverySort | undefined;
}

export interface InvokeAndPayArgs {
  service_id: string;
  payload: Record<string, unknown>;
  costUsdc?: string | undefined;
  idempotencyKey?: string | undefined;
  maxCostUsdc?: string | undefined;
  requestId?: string | undefined;
  responseMode?: ResponseMode | undefined;
}

export interface GetReceiptArgs {
  invocation_id: string;
}

export interface GatewayFetchInit {
  method?: string | undefined;
  body?: unknown;
  requestId?: string | undefined;
}

export interface GatewayErrorPayload {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export class SynapseGatewayClient {
  private readonly fetchImpl: FetchLike;

  constructor(private readonly config: ServerConfig, fetchImpl: FetchLike = fetch) {
    this.fetchImpl = fetchImpl;
  }

  discoverServices(args: DiscoverServicesArgs): Promise<unknown> {
    const limit = clampLimit(args.limit);
    const body: Record<string, unknown> = {
      tags: args.tags ?? [],
      page: 1,
      pageSize: limit,
      sort: args.sort ?? "best_match"
    };
    const query = args.query?.trim();
    if (query) body.query = query;

    return this.request("/api/v1/agent/discovery/search", { method: "POST", body });
  }

  async invokeAndPay(args: InvokeAndPayArgs): Promise<unknown> {
    const idempotencyKey = args.idempotencyKey?.trim() || randomUUID();
    const body: Record<string, unknown> = {
      serviceId: args.service_id,
      idempotencyKey,
      payload: { body: args.payload },
      responseMode: args.responseMode ?? "sync"
    };
    if (args.costUsdc) body.costUsdc = args.costUsdc;
    if (args.maxCostUsdc) body.maxCostUsdc = args.maxCostUsdc;

    const requestInit: GatewayFetchInit = {
      method: "POST",
      body
    };
    if (args.requestId?.trim()) requestInit.requestId = args.requestId;

    const result = await this.request("/api/v1/agent/invoke", requestInit);
    return { idempotencyKey, gateway: result };
  }

  getReceipt(args: GetReceiptArgs): Promise<unknown> {
    return this.request(`/api/v1/agent/invocations/${encodeURIComponent(args.invocation_id)}`);
  }

  async request(path: string, init: GatewayFetchInit = {}): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const headers: Record<string, string> = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Credential": this.config.agentKey
      };
      if (init.requestId?.trim()) headers["X-Request-Id"] = init.requestId.trim();

      const fetchInit: RequestInit = {
        method: init.method ?? "GET",
        headers,
        signal: controller.signal
      };
      if (init.body !== undefined) fetchInit.body = JSON.stringify(init.body);

      const response = await this.fetchImpl(`${this.config.gatewayUrl}${path}`, fetchInit);
      const payload = await parseResponseBody(response);
      if (!response.ok) throw GatewayError.fromResponse(response.status, payload);
      return payload;
    } catch (error) {
      if (isAbortError(error)) {
        throw new GatewayError(504, "GATEWAY_TIMEOUT", "Synapse Gateway request timed out.");
      }
      if (error instanceof GatewayError) throw error;
      throw new GatewayError(502, "GATEWAY_REQUEST_FAILED", errorMessage(error));
    } finally {
      clearTimeout(timer);
    }
  }
}

export class GatewayError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "GatewayError";
  }

  static fromResponse(status: number, payload: unknown): GatewayError {
    const detail = extractDetail(payload);
    return new GatewayError(status, detail.code, detail.message, payload);
  }

  toJSON(): GatewayErrorPayload {
    const payload: GatewayErrorPayload = {
      status: this.status,
      code: this.code,
      message: this.message
    };
    if (this.details !== undefined) payload.details = this.details;
    return payload;
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { text };
  }
}

function extractDetail(payload: unknown): { code: string; message: string } {
  if (isRecord(payload)) {
    const detail = payload.detail;
    if (isRecord(detail)) {
      return {
        code: stringValue(detail.code, "GATEWAY_ERROR"),
        message: stringValue(detail.message, "Synapse Gateway returned an error.")
      };
    }
    return {
      code: stringValue(payload.code, "GATEWAY_ERROR"),
      message: stringValue(payload.message ?? payload.error ?? payload.text, "Synapse Gateway returned an error.")
    };
  }
  return { code: "GATEWAY_ERROR", message: "Synapse Gateway returned an error." };
}

function clampLimit(value: number | undefined): number {
  if (value === undefined) return 10;
  return Math.min(50, Math.max(1, Math.trunc(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
