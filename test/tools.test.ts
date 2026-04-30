import { describe, expect, it } from "vitest";
import { z } from "zod";
import { invokeAndPaySchema, toolError } from "../src/tools.js";
import { GatewayError } from "../src/gateway.js";

describe("tool schemas", () => {
  it("allows costUsdc to be omitted for token-metered services but validates money strings when present", () => {
    const schema = z.object(invokeAndPaySchema);

    expect(
      schema.safeParse({ service_id: "svc_1", payload: {}, idempotencyKey: "job-1" }).success
    ).toBe(true);
    expect(
      schema.safeParse({ service_id: "svc_1", payload: {}, costUsdc: "0.050000", idempotencyKey: "job-1" }).success
    ).toBe(true);
    expect(
      schema.safeParse({ service_id: "svc_1", payload: {}, costUsdc: 0.05, idempotencyKey: "job-1" }).success
    ).toBe(false);
  });

  it("returns actionable tool errors instead of throwing raw gateway details", () => {
    const result = toolError(new GatewayError(402, "INSUFFICIENT_BALANCE", "Fund the owner balance first."));

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      status: 402,
      code: "INSUFFICIENT_BALANCE",
      message: "Fund the owner balance first."
    });
  });
});
