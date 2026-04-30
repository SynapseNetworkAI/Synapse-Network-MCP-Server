export function duplicateA() {
  const accountId = normalizeAccountId("owner-a");
  const gatewayUrl = normalizeGatewayUrl("https://gateway.example");
  const credentialId = normalizeCredentialId("agt_a");
  const requestId = normalizeRequestId("req-a");
  const serviceId = normalizeServiceId("svc_a");
  const payloadHash = normalizePayloadHash("hash-a");
  const idempotencyKey = normalizeIdempotencyKey("idem-a");
  return { accountId, gatewayUrl, credentialId, requestId, serviceId, payloadHash, idempotencyKey };
}
