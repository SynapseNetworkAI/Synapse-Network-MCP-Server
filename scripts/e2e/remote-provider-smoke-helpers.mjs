import { execFileSync } from "node:child_process";
import dns from "node:dns";
import https from "node:https";

export function requiredEnv(name, label) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`${name} is required for ${label}.`);
    process.exit(2);
  }
  return value;
}

export async function postJson(url, headers, body) {
  const { statusCode, payload } = await postJsonWithHttps(url, headers, body);
  if (statusCode < 200 || statusCode >= 300) {
    console.error(JSON.stringify(payload, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify(payload, null, 2));
}

export function remoteSmokeConfig() {
  return {
    serverUrl: process.env.SYNAPSE_REMOTE_MCP_URL || "https://mcp.synapse-network.ai/mcp/sse",
    authorization: requiredEnv("SYNAPSE_REMOTE_MCP_AUTH_TOKEN", "Remote MCP smoke")
  };
}

export function smokeLookup(hostname, options, callback) {
  dns.lookup(hostname, options, (error, address, family) => {
    const wantsAll = Boolean(options?.all);
    if (!error) {
      if (Array.isArray(address)) {
        if (wantsAll) {
          callback(null, address);
          return;
        }
        const first = address[0];
        callback(null, first?.address, first?.family);
        return;
      }
      callback(null, address, family);
      return;
    }
    const fallback = resolveWithDig(hostname, options?.family);
    if (fallback) {
      if (wantsAll) {
        callback(null, [fallback]);
        return;
      }
      callback(null, fallback.address, fallback.family);
      return;
    }
    callback(error, address, family);
  });
}

export function resolveWithDig(hostname, family) {
  const args = family === 6 ? ["+short", "AAAA", hostname] : ["+short", hostname];
  let output;
  try {
    output = execFileSync("dig", args, {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    return undefined;
  }
  for (const line of output.split(/\r?\n/)) {
    const candidate = line.trim();
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(candidate)) {
      return { address: candidate, family: 4 };
    }
    if (candidate.includes(":") && /^[0-9a-f:]+$/i.test(candidate)) {
      return { address: candidate, family: 6 };
    }
  }
  return undefined;
}

function postJsonWithHttps(url, headers, body) {
  const target = new URL(url);
  const requestBody = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = https.request(
      target,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(requestBody),
          ...headers
        },
        lookup: smokeLookup,
        timeout: 60000
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          let payload;
          try {
            payload = raw ? JSON.parse(raw) : undefined;
          } catch {
            payload = raw;
          }
          resolve({ statusCode: response.statusCode ?? 0, payload });
        });
      }
    );
    request.on("timeout", () => {
      request.destroy(new Error(`POST ${target.hostname} timed out.`));
    });
    request.on("error", reject);
    request.end(requestBody);
  });
}
