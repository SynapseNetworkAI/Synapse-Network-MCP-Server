import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { SynapseGatewayClient } from "./gateway.js";
import { createToolHandlers, discoverServicesSchema, getReceiptSchema, invokeAndPaySchema } from "./tools.js";

export function createServer(client = new SynapseGatewayClient(loadConfig())): McpServer {
  const server = new McpServer({
    name: "synapse-network-mcp-server",
    version: "0.1.0"
  });
  const handlers = createToolHandlers(client);

  server.registerTool(
    "discover_services",
    {
      title: "Discover Synapse services",
      description:
        "Search SynapseNetwork for agent-callable services. Use this before invoke_and_pay. For fixed-price APIs, copy the observed price into costUsdc.",
      inputSchema: discoverServicesSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    handlers.discoverServices
  );

  server.registerTool(
    "invoke_and_pay",
    {
      title: "Invoke and pay",
      description:
        "Invoke a Synapse service using the configured Agent Key. This is a payment action. For fixed-price APIs, pass costUsdc from discovery. For token-metered LLMs, omit costUsdc and pass maxCostUsdc. This server never caches prices.",
      inputSchema: invokeAndPaySchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true
      }
    },
    handlers.invokeAndPay
  );

  server.registerTool(
    "get_receipt",
    {
      title: "Get invocation receipt",
      description: "Fetch a Synapse invocation receipt/status. Gateway enforces that the invocation belongs to the configured Agent Key.",
      inputSchema: getReceiptSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    handlers.getReceipt
  );

  return server;
}

export async function runStdioServer(): Promise<void> {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}
