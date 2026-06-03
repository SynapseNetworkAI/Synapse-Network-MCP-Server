#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-}"
REGION="${REGION:-us-central1}"
ARTIFACT_REPOSITORY="${ARTIFACT_REPOSITORY:-synapse-prod}"
IMAGE_NAME="${IMAGE_NAME:-synapse-mcp-server}"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || date -u +%Y%m%d%H%M%S)}"
SERVICE_NAME="${SERVICE_NAME:-synapse-prod-mcp-server}"
DOMAIN="${DOMAIN:-mcp.synapse-network.ai}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://${DOMAIN}}"
GATEWAY_URL="${GATEWAY_URL:-https://api.synapse-network.ai}"
MIN_INSTANCES="${MIN_INSTANCES:-0}"
MAX_INSTANCES="${MAX_INSTANCES:-1}"
CPU="${CPU:-1}"
MEMORY="${MEMORY:-512Mi}"
CONCURRENCY="${CONCURRENCY:-20}"
TIMEOUT="${TIMEOUT:-300}"
CREATE_ARTIFACT_REPOSITORY="${CREATE_ARTIFACT_REPOSITORY:-1}"
CREATE_DOMAIN_MAPPING="${CREATE_DOMAIN_MAPPING:-0}"
ENABLE_SESSION_AFFINITY="${ENABLE_SESSION_AFFINITY:-0}"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-}"
REMOTE_AUTH_MODE="${SYNAPSE_REMOTE_AUTH_MODE:-${REMOTE_AUTH_MODE:-agent_key}}"
OAUTH_ISSUER="${SYNAPSE_OAUTH_ISSUER:-${OAUTH_ISSUER:-}}"
OAUTH_AUDIENCE="${SYNAPSE_OAUTH_AUDIENCE:-${OAUTH_AUDIENCE:-}}"
OAUTH_JWT_SECRET_NAME="${SYNAPSE_OAUTH_JWT_SECRET_NAME:-${OAUTH_JWT_SECRET_NAME:-}}"
DRY_RUN="${DRY_RUN:-0}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "PROJECT_ID is required." >&2
  exit 2
fi

IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPOSITORY}/${IMAGE_NAME}:${IMAGE_TAG}"

if [[ "${REMOTE_AUTH_MODE}" != "agent_key" && "${REMOTE_AUTH_MODE}" != "oauth" && "${REMOTE_AUTH_MODE}" != "synapse_oauth" ]]; then
  echo "SYNAPSE_REMOTE_AUTH_MODE/REMOTE_AUTH_MODE must be agent_key, oauth, or synapse_oauth." >&2
  exit 2
fi

if [[ "${REMOTE_AUTH_MODE}" == "synapse_oauth" ]]; then
  if [[ -z "${OAUTH_ISSUER}" || -z "${OAUTH_AUDIENCE}" || -z "${OAUTH_JWT_SECRET_NAME}" ]]; then
    echo "synapse_oauth mode requires SYNAPSE_OAUTH_ISSUER, SYNAPSE_OAUTH_AUDIENCE, and SYNAPSE_OAUTH_JWT_SECRET_NAME." >&2
    exit 2
  fi
fi

run() {
  if [[ "${DRY_RUN}" == "1" ]]; then
    printf '+'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

ensure_artifact_repository() {
  if [[ "${CREATE_ARTIFACT_REPOSITORY}" != "1" ]]; then
    return
  fi
  if [[ "${DRY_RUN}" == "1" ]]; then
    run gcloud artifacts repositories create "${ARTIFACT_REPOSITORY}" \
      --project "${PROJECT_ID}" \
      --location "${REGION}" \
      --repository-format docker \
      --description "Synapse production container images"
    return
  fi
  if gcloud artifacts repositories describe "${ARTIFACT_REPOSITORY}" \
    --project "${PROJECT_ID}" \
    --location "${REGION}" >/dev/null 2>&1; then
    return
  fi
  run gcloud artifacts repositories create "${ARTIFACT_REPOSITORY}" \
    --project "${PROJECT_ID}" \
    --location "${REGION}" \
    --repository-format docker \
    --description "Synapse production container images"
}

deploy_env_vars="SYNAPSE_MCP_HTTP_HOST=0.0.0.0,SYNAPSE_MCP_PUBLIC_BASE_URL=${PUBLIC_BASE_URL},SYNAPSE_ENV=prod,SYNAPSE_GATEWAY_URL=${GATEWAY_URL},SYNAPSE_REMOTE_AUTH_MODE=${REMOTE_AUTH_MODE}"
if [[ "${REMOTE_AUTH_MODE}" == "synapse_oauth" ]]; then
  deploy_env_vars+=",SYNAPSE_OAUTH_ISSUER=${OAUTH_ISSUER},SYNAPSE_OAUTH_AUDIENCE=${OAUTH_AUDIENCE}"
fi

deploy_args=(
  run deploy "${SERVICE_NAME}"
  --project "${PROJECT_ID}"
  --region "${REGION}"
  --image "${IMAGE}"
  --platform managed
  --no-invoker-iam-check
  --port 8080
  --min-instances "${MIN_INSTANCES}"
  --max-instances "${MAX_INSTANCES}"
  --cpu "${CPU}"
  --memory "${MEMORY}"
  --concurrency "${CONCURRENCY}"
  --timeout "${TIMEOUT}"
  --set-env-vars "${deploy_env_vars}"
)

if [[ "${REMOTE_AUTH_MODE}" == "synapse_oauth" ]]; then
  deploy_args+=(
    --update-secrets "SYNAPSE_OAUTH_JWT_SECRET=${OAUTH_JWT_SECRET_NAME}:latest"
  )
fi

if [[ -n "${SERVICE_ACCOUNT}" ]]; then
  deploy_args+=(--service-account "${SERVICE_ACCOUNT}")
fi

if [[ "${ENABLE_SESSION_AFFINITY}" == "1" ]]; then
  deploy_args+=(--session-affinity)
fi

ensure_artifact_repository

run gcloud builds submit \
  --project "${PROJECT_ID}" \
  --tag "${IMAGE}" \
  .

run gcloud "${deploy_args[@]}"

if [[ "${CREATE_DOMAIN_MAPPING}" == "1" ]]; then
  if [[ "${DRY_RUN}" == "1" ]]; then
    run gcloud beta run domain-mappings create \
      --project "${PROJECT_ID}" \
      --region "${REGION}" \
      --service "${SERVICE_NAME}" \
      --domain "${DOMAIN}"
  elif gcloud beta run domain-mappings describe \
    --project "${PROJECT_ID}" \
    --region "${REGION}" \
    --domain "${DOMAIN}" >/dev/null 2>&1; then
    echo "Domain mapping already exists for ${DOMAIN}."
  else
    run gcloud beta run domain-mappings create \
      --project "${PROJECT_ID}" \
      --region "${REGION}" \
      --service "${SERVICE_NAME}" \
      --domain "${DOMAIN}"
  fi
fi

cat <<EOF

Remote MCP deploy target:
  image: ${IMAGE}
  service: ${SERVICE_NAME}
  public base URL: ${PUBLIC_BASE_URL}

Validate after DNS/TLS is live:
  curl -fsS ${PUBLIC_BASE_URL}/healthz
  curl -fsS ${PUBLIC_BASE_URL}/readyz
EOF
