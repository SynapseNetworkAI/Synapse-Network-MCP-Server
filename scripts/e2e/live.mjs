#!/usr/bin/env node
import { assert, assertToolList, asRecord, callToolData, withMcpClient } from "./mcp-client-helpers.mjs";

const profile = process.argv[2] ?? "staging";
if (!["local", "staging", "prod"].includes(profile)) {
  fail(`Unsupported E2E profile '${profile}'. Expected local, staging, or prod.`);
}

const agentKey = process.env.SYNAPSE_AGENT_KEY?.trim();
if (!agentKey) fail("SYNAPSE_AGENT_KEY=agt_xxx is required for live MCP E2E.");
if (!agentKey.startsWith("agt_")) fail("SYNAPSE_AGENT_KEY must start with agt_.");

if (profile === "prod" && process.env.SYNAPSE_ENV !== "prod") {
  fail("Prod E2E must be explicit: set SYNAPSE_ENV=prod and run npm run test:e2e:prod.");
}

const rawQuery = process.env.SYNAPSE_E2E_QUERY?.trim() || "";
const query = isPriceOnlyQuery(rawQuery) ? "" : rawQuery;
const explicitServiceId = process.env.SYNAPSE_E2E_SERVICE_ID?.trim();
const allowPaid = process.env.SYNAPSE_E2E_ALLOW_PAID === "true";
const explicitCostUsdc = process.env.SYNAPSE_E2E_COST_USDC?.trim();
const explicitMaxCostUsdc = process.env.SYNAPSE_E2E_MAX_COST_USDC?.trim();
const payload = parsePayload(process.env.SYNAPSE_E2E_PAYLOAD_JSON);
const idempotencyKey = process.env.SYNAPSE_E2E_IDEMPOTENCY_KEY?.trim() || `mcp-${profile}-e2e-${Date.now()}`;
const env = {
  SYNAPSE_AGENT_KEY: agentKey,
  SYNAPSE_ENV: profile,
  SYNAPSE_TIMEOUT_MS: process.env.SYNAPSE_TIMEOUT_MS || "60000"
};
if (process.env.SYNAPSE_GATEWAY_URL?.trim()) env.SYNAPSE_GATEWAY_URL = process.env.SYNAPSE_GATEWAY_URL.trim();

await withMcpClient(env, async (client) => {
  await assertToolList(client);

  const discoveryArgs = { limit: Number(process.env.SYNAPSE_E2E_LIMIT || 10), sort: "lowest_price" };
  if (query) discoveryArgs.query = query;
  const discovery = asRecord(await callToolData(client, "discover_services", discoveryArgs), "discover_services data");
  const services = extractServices(discovery);
  assert(services.length > 0, `discover_services returned no services${query ? ` for query '${query}'` : ""}.`);

  const selected = selectService(services);
  const serviceId = serviceIdOf(selected);
  assert(serviceId, "Selected service does not expose serviceId/service_id/id.");

  const invokeArgs = {
    service_id: serviceId,
    payload,
    idempotencyKey,
    requestId: `${idempotencyKey}-trace`,
    responseMode: "sync"
  };

  if (isTokenMetered(selected)) {
    if (!explicitMaxCostUsdc) {
      fail("Selected service appears token-metered. Set SYNAPSE_E2E_MAX_COST_USDC, e.g. '0.100000', before invoking live.");
    }
    invokeArgs.maxCostUsdc = explicitMaxCostUsdc;
  } else {
    const costUsdc = explicitCostUsdc || priceOf(selected);
    if (!costUsdc) fail("Selected fixed-price service has no discoverable price. Set SYNAPSE_E2E_COST_USDC explicitly.");
    if (!isZeroMoney(costUsdc) && !allowPaid) {
      fail(`Selected service costs ${costUsdc} USDC. Set SYNAPSE_E2E_ALLOW_PAID=true and SYNAPSE_E2E_COST_USDC='${costUsdc}' to run a paid live E2E.`);
    }
    invokeArgs.costUsdc = costUsdc;
  }

  console.log(`Live MCP ${profile} E2E selected service: ${serviceId}`);
  const invokeData = asRecord(await callToolData(client, "invoke_and_pay", invokeArgs), "invoke_and_pay data");
  const gatewayResult = asRecord(invokeData.gateway ?? invokeData, "invoke_and_pay gateway result");
  const invocationId = invocationIdOf(gatewayResult);
  assert(invocationId, `invoke_and_pay response did not contain invocationId: ${JSON.stringify(gatewayResult)}`);

  const charged = moneyValue(gatewayResult, ["chargedUsdc", "charged_usdc", "totalCharge", "totalChargeUsdc"]);
  if (charged !== undefined) assert(typeof charged === "string", "invoke charged money field must be a string.");

  const receipt = asRecord(await callToolData(client, "get_receipt", { invocation_id: invocationId }), "get_receipt data");
  assert(invocationIdOf(receipt) === invocationId, "get_receipt invocationId should match invoke response.");
  assert(typeof receipt.status === "string" && receipt.status.length > 0, "get_receipt must include a status string.");
  const receiptCharged = moneyValue(receipt, ["chargedUsdc", "charged_usdc", "totalCharge", "totalChargeUsdc"]);
  if (receiptCharged !== undefined) assert(typeof receiptCharged === "string", "receipt charged money field must be a string.");

  console.log(`Live MCP ${profile} E2E passed: ${serviceId} -> ${invocationId} -> ${receipt.status}`);
});

function extractServices(discovery) {
  const services = discovery.results ?? discovery.services ?? discovery.data?.results ?? discovery.data?.services;
  if (!Array.isArray(services)) throw new Error(`Discovery response did not contain results/services array: ${JSON.stringify(discovery)}`);
  return services.filter((service) => service && typeof service === "object");
}

function selectService(services) {
  if (explicitServiceId) {
    const matched = services.find((service) => serviceIdOf(service) === explicitServiceId);
    if (!matched) fail(`SYNAPSE_E2E_SERVICE_ID=${explicitServiceId} was not found in discovery results${query ? ` for query '${query}'` : ""}.`);
    return matched;
  }

  const freeFixed = services.find((service) => !isTokenMetered(service) && isZeroMoney(priceOf(service)));
  if (freeFixed) return freeFixed;

  const tokenMeteredWithCap = services.find((service) => isTokenMetered(service) && explicitMaxCostUsdc);
  if (tokenMeteredWithCap) return tokenMeteredWithCap;

  if (allowPaid) return services[0];
  fail("No free fixed-price service found. Set SYNAPSE_E2E_SERVICE_ID plus cost/cap, or set SYNAPSE_E2E_ALLOW_PAID=true for paid staging E2E.");
}

function serviceIdOf(service) {
  return stringOrUndefined(service.serviceId ?? service.service_id ?? service.id);
}

function isTokenMetered(service) {
  const priceModel = stringOrUndefined(service.priceModel ?? service.price_model ?? service.pricing?.priceModel ?? service.pricing?.price_model);
  const serviceKind = stringOrUndefined(service.serviceKind ?? service.service_kind);
  return priceModel === "token_metered" || serviceKind === "llm";
}

function priceOf(service) {
  return stringOrUndefined(
    service.priceUsdc ??
      service.price_usdc ??
      service.basePriceUsdc ??
      service.base_price_usdc ??
      service.pricing?.amount ??
      service.pricing?.priceUsdc ??
      service.pricing?.price_usdc ??
      service.pricing?.basePriceUsdc ??
      service.pricing?.base_price_usdc
  );
}

function invocationIdOf(value) {
  return stringOrUndefined(value.invocationId ?? value.invocation_id ?? value.receipt?.invocationId ?? value.receipt?.invocation_id);
}

function moneyValue(value, keys) {
  for (const key of keys) {
    if (value[key] !== undefined) return value[key];
  }
  if (value.synapse && typeof value.synapse === "object") {
    for (const key of keys) {
      if (value.synapse[key] !== undefined) return value.synapse[key];
    }
  }
  return undefined;
}

function parsePayload(raw) {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("payload must be a JSON object");
    return parsed;
  } catch (error) {
    fail(`SYNAPSE_E2E_PAYLOAD_JSON must be a JSON object: ${error.message}`);
  }
}

function isZeroMoney(value) {
  if (value === undefined) return false;
  return /^0+(\.0+)?$/.test(value);
}

function isPriceOnlyQuery(value) {
  return /^(free|free service|free services|zero price|zero cost)$/i.test(value);
}

function stringOrUndefined(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
