import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { GatewayError, SynapseGatewayClient } from "./gateway.js";

interface ToolErrorPayload {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

const moneyString = z
  .string()
  .regex(/^\d+(\.\d{1,6})?$/, "Use a USDC decimal string with up to 6 decimals, for example '0.050000'.");

export const discoverServicesSchema = {
  query: z.string().trim().min(1).max(256).optional().describe("Natural-language service intent, for example 'cheap weather API'."),
  tags: z.array(z.string().trim().min(1).max(64)).max(20).optional().describe("Optional service tags to filter by."),
  limit: z.number().int().min(1).max(50).optional().describe("Maximum services to return. Defaults to 10."),
  sort: z.enum(["best_match", "lowest_price", "fastest", "highest_reliability"]).optional().describe("Discovery ranking strategy.")
};

export const invokeAndPaySchema = {
  service_id: z.string().trim().min(1).max(128).describe("Synapse serviceId returned by discover_services."),
  payload: z.record(z.string(), z.unknown()).describe("JSON payload to forward to the selected provider service."),
  costUsdc: moneyString.optional().describe("Required for fixed-price APIs: exact price assertion copied from discover_services. Omit for token-metered LLM services and use maxCostUsdc instead."),
  idempotencyKey: z.string().trim().min(1).max(128).optional().describe("Stable task-level idempotency key. If omitted, this server generates a UUID."),
  maxCostUsdc: moneyString.optional().describe("Optional cap for token-metered or LLM services."),
  requestId: z.string().trim().min(1).max(128).optional().describe("Optional trace request id forwarded as X-Request-Id."),
  responseMode: z.enum(["sync", "async", "stream"]).optional().describe("Gateway response mode. Use sync for V1 unless a service explicitly supports async.")
};

export const getReceiptSchema = {
  invocation_id: z.string().trim().min(1).max(128).describe("Invocation id returned by invoke_and_pay.")
};

const discoverServicesObjectSchema = z.object(discoverServicesSchema);
const invokeAndPayObjectSchema = z.object(invokeAndPaySchema);
const getReceiptObjectSchema = z.object(getReceiptSchema);

type DiscoverServicesInput = z.infer<typeof discoverServicesObjectSchema>;
type InvokeAndPayInput = z.infer<typeof invokeAndPayObjectSchema>;
type GetReceiptInput = z.infer<typeof getReceiptObjectSchema>;

export function createToolHandlers(client: SynapseGatewayClient) {
  return {
    discoverServices: async (args: DiscoverServicesInput): Promise<CallToolResult> => {
      try {
        const data = await client.discoverServices(discoverServicesObjectSchema.parse(args));
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
    invokeAndPay: async (args: InvokeAndPayInput): Promise<CallToolResult> => {
      try {
        const data = await client.invokeAndPay(invokeAndPayObjectSchema.parse(args));
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
    getReceipt: async (args: GetReceiptInput): Promise<CallToolResult> => {
      try {
        const data = await client.getReceipt(getReceiptObjectSchema.parse(args));
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    }
  };
}

export function toolResult(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: { data }
  };
}

export function toolError(error: unknown): CallToolResult {
  const payload = normalizeError(error);
  const structuredContent: Record<string, unknown> = { ...payload };
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent
  };
}

function normalizeError(error: unknown): ToolErrorPayload {
  if (error instanceof GatewayError) return error.toJSON();
  return {
    status: 500,
    code: "MCP_SERVER_ERROR",
    message: error instanceof Error ? error.message : String(error)
  };
}
