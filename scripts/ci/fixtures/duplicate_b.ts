export function duplicateB() {
  const accountId = normalizeAccountId("owner-b");
  const gatewayUrl = normalizeGatewayUrl("https://gateway.example");
  const credentialId = normalizeCredentialId("agt_b");
  const requestId = normalizeRequestId("req-b");
  const serviceId = normalizeServiceId("svc_b");
  const payloadHash = normalizePayloadHash("hash-b");
  const idempotencyKey = normalizeIdempotencyKey("idem-b");
  return { accountId, gatewayUrl, credentialId, requestId, serviceId, payloadHash, idempotencyKey };
}
