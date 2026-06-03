import { describe, expect, it, vi } from "vitest";
import { GatewayError, SynapseGatewayClient, type FetchLike } from "../src/gateway.js";

const config = {
  agentKey: "agt_test",
  gatewayUrl: "http://gateway.test",
  timeoutMs: 30_000
};

describe("SynapseGatewayClient", () => {
  it("calls discovery search without storing state", async () => {
    const calls: Array<{ input: string | URL; init?: RequestInit }> = [];
    const fetchImpl: FetchLike = vi.fn(async (input, init) => {
      calls.push({ input, init });
      return jsonResponse({ results: [{ serviceId: "svc_weather", pricing: { amount: "0.050000" } }] });
    });
    const client = new SynapseGatewayClient(config, fetchImpl);

    const result = await client.discoverServices({ query: "weather", limit: 5, sort: "lowest_price" });

    expect(result).toEqual({ results: [{ serviceId: "svc_weather", pricing: { amount: "0.050000" } }] });
    expect(calls[0]?.input).toBe("http://gateway.test/api/v1/agent/discovery/search");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.headers).toMatchObject({ "X-Credential": "agt_test" });
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      query: "weather",
      tags: [],
      page: 1,
      pageSize: 5,
      sort: "lowest_price"
    });
  });

  it("can call Gateway with a Synapse OAuth access token", async () => {
    const calls: Array<{ input: string | URL; init?: RequestInit }> = [];
    const fetchImpl: FetchLike = vi.fn(async (input, init) => {
      calls.push({ input, init });
      return jsonResponse({ results: [] });
    });
    const client = new SynapseGatewayClient(
      {
        oauthAccessToken: "oauth_access",
        gatewayUrl: "http://gateway.test",
        timeoutMs: 30_000
      },
      fetchImpl
    );

    await client.discoverServices({});

    expect(calls[0]?.init?.headers).toMatchObject({
      Authorization: "Bearer oauth_access"
    });
    expect(calls[0]?.init?.headers).not.toMatchObject({ "X-Credential": expect.any(String) });
  });

  it("passes caller costUsdc directly and generates idempotency only when omitted", async () => {
    const calls: Array<{ input: string | URL; init?: RequestInit }> = [];
    const fetchImpl: FetchLike = vi.fn(async (input, init) => {
      calls.push({ input, init });
      return jsonResponse({ invocationId: "inv_1", status: "SUCCEEDED", chargedUsdc: "0.050000" });
    });
    const client = new SynapseGatewayClient(config, fetchImpl);

    const result = await client.invokeAndPay({
      service_id: "svc_weather",
      payload: { city: "Kuala Lumpur" },
      costUsdc: "0.050000"
    });

    const body = JSON.parse(String(calls[0]?.init?.body));
    expect(body.serviceId).toBe("svc_weather");
    expect(body.costUsdc).toBe("0.050000");
    expect(body.payload).toEqual({ body: { city: "Kuala Lumpur" } });
    expect(typeof body.idempotencyKey).toBe("string");
    expect(result).toEqual({
      idempotencyKey: body.idempotencyKey,
      gateway: { invocationId: "inv_1", status: "SUCCEEDED", chargedUsdc: "0.050000" }
    });
  });

  it("preserves caller idempotency and request id", async () => {
    const calls: Array<{ input: string | URL; init?: RequestInit }> = [];
    const fetchImpl: FetchLike = vi.fn(async (input, init) => {
      calls.push({ input, init });
      return jsonResponse({ invocationId: "inv_1" });
    });
    const client = new SynapseGatewayClient(config, fetchImpl);

    await client.invokeAndPay({
      service_id: "svc_weather",
      payload: {},
      costUsdc: "0.010000",
      idempotencyKey: "job-123",
      requestId: "trace-123"
    });

    expect(JSON.parse(String(calls[0]?.init?.body)).idempotencyKey).toBe("job-123");
    expect(calls[0]?.init?.headers).toMatchObject({ "X-Request-Id": "trace-123" });
  });

  it("normalizes gateway error payloads", async () => {
    const fetchImpl: FetchLike = vi.fn(async () =>
      jsonResponse({ detail: { code: "PRICE_MISMATCH", message: "Rediscover before retrying." } }, 422)
    );
    const client = new SynapseGatewayClient(config, fetchImpl);

    await expect(
      client.invokeAndPay({ service_id: "svc_weather", payload: {}, costUsdc: "0.010000", idempotencyKey: "job-1" })
    ).rejects.toMatchObject({ status: 422, code: "PRICE_MISMATCH" } satisfies Partial<GatewayError>);
  });

  it("calls receipt endpoint with credential ownership enforced by Gateway", async () => {
    const fetchImpl: FetchLike = vi.fn(async () => jsonResponse({ invocationId: "inv_1", status: "SUCCEEDED" }));
    const client = new SynapseGatewayClient(config, fetchImpl);

    await expect(client.getReceipt({ invocation_id: "inv_1" })).resolves.toEqual({ invocationId: "inv_1", status: "SUCCEEDED" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://gateway.test/api/v1/agent/invocations/inv_1",
      expect.objectContaining({ method: "GET" })
    );
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
