import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import ipaddr from "ipaddr.js";
import { AppError } from "../shared/errors.js";
import { publicUrl } from "../validators/common.js";
export function isPublicAddress(address: string): boolean {
  try {
    let parsed = ipaddr.parse(address);
    if (
      parsed.kind() === "ipv6" &&
      (parsed as ipaddr.IPv6).isIPv4MappedAddress()
    )
      parsed = (parsed as ipaddr.IPv6).toIPv4Address();
    return parsed.range() === "unicast";
  } catch {
    return false;
  }
}
export async function resolvePublic(value: string) {
  const url = new URL(publicUrl.parse(value));
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    (!hostname.includes(".") && !ipaddr.isValid(hostname))
  )
    throw new AppError(
      422,
      "UNSAFE_URL",
      "O endereço deve apontar para um host público.",
    );
  const addresses = ipaddr.isValid(hostname)
    ? [
        {
          address: hostname,
          family: ipaddr.parse(hostname).kind() === "ipv4" ? 4 : 6,
        },
      ]
    : await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    throw new AppError(
      422,
      "UNSAFE_URL",
      "Endereços internos ou reservados não são permitidos.",
    );
  return { url, address: addresses[0]! };
}
export interface Probe {
  result: "SUCCESS" | "HTTP_ERROR" | "TIMEOUT" | "NETWORK_ERROR";
  httpStatus: number | null;
  durationMs: number;
  error: string | null;
}
// DNS is checked AND pinned in the connection lookup, preventing rebinding.
// Bodies are never downloaded. Each redirect gets a fresh validation and shares one deadline.
export async function safeGet(value: string, timeoutMs = 8000): Promise<Probe> {
  const started = Date.now();
  let timer: NodeJS.Timeout | undefined;
  let abort: () => void = () => {};
  const operation = async () => {
    let next = value;
    for (let redirects = 0; redirects <= 3; redirects++) {
      const target = await resolvePublic(next);
      if (Date.now() - started >= timeoutMs) throw new Error("TIMEOUT");
      const result = await new Promise<{ status: number; location?: string }>(
        (resolve, reject) => {
          const request = (
            target.url.protocol === "https:" ? https : http
          ).request(
            target.url,
            {
              method: "GET",
              agent: false,
              headers: {
                "User-Agent": "HelloCliente-Healthcheck/1.0",
                Accept: "text/html,application/json",
              },
              maxHeaderSize: 16384,
              lookup: (_hostname, options, callback) => {
                if (options.all)
                  callback(null, [
                    {
                      address: target.address.address,
                      family: target.address.family,
                    },
                  ]);
                else
                  callback(null, target.address.address, target.address.family);
              },
            },
            (response) => {
              const status = response.statusCode ?? 500;
              const location = response.headers.location;
              response.destroy();
              resolve({ status, location });
            },
          );
          abort = () => request.destroy(new Error("TIMEOUT"));
          request.on("error", reject);
          request.end();
        },
      );
      if (
        [301, 302, 303, 307, 308].includes(result.status) &&
        result.location
      ) {
        if (redirects === 3) throw new Error("TOO_MANY_REDIRECTS");
        const redirect = new URL(result.location, target.url);
        if (target.url.protocol === "https:" && redirect.protocol !== "https:")
          throw new Error("HTTPS_DOWNGRADE");
        next = redirect.href;
        continue;
      }
      return {
        result:
          result.status >= 200 && result.status < 400
            ? ("SUCCESS" as const)
            : ("HTTP_ERROR" as const),
        httpStatus: result.status,
        durationMs: Date.now() - started,
        error: null,
      };
    }
    throw new Error("TOO_MANY_REDIRECTS");
  };
  try {
    return await Promise.race([
      operation(),
      new Promise<Probe>((_resolve, reject) => {
        timer = setTimeout(() => {
          abort();
          reject(new Error("TIMEOUT"));
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    const timeout = error instanceof Error && error.message === "TIMEOUT";
    return {
      result: timeout ? "TIMEOUT" : "NETWORK_ERROR",
      httpStatus: null,
      durationMs: Date.now() - started,
      error: timeout
        ? "TIMEOUT"
        : error instanceof AppError
          ? error.code
          : "NETWORK_OR_REDIRECT_ERROR",
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
