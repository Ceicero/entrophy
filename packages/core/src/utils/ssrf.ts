import dns from 'node:dns/promises';
import net from 'node:net';

/** Thrown by `assertPublicHttpUrl` when a URL is rejected as an unsafe outbound target. */
export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}

export interface LookupAddress {
  address: string;
  family: number;
}

export interface AssertPublicHttpUrlOptions {
  /** Allow plain `http://` (default: only `https://` is allowed). */
  allowHttp?: boolean;
  /** Ports allowed in addition to the default 80/443. */
  allowPorts?: number[];
  /** Override DNS resolution (used by tests to avoid real network lookups). Defaults to `dns.lookup(host, { all: true })`. */
  lookup?: (hostname: string) => Promise<LookupAddress[]>;
}

const METADATA_IP = '169.254.169.254';

/**
 * True if `ip` is a loopback, private (RFC1918), link-local, CGNAT, multicast/reserved, unspecified,
 * IPv6 ULA/link-local/multicast address, or the cloud metadata IP.
 */
export function isPrivateIp(ip: string): boolean {
  if (ip === METADATA_IP) return true;

  const family = net.isIP(ip);
  if (family === 4) {
    const octets = ip.split('.').map(Number);
    const [a, b] = octets;
    if (octets.some((n) => Number.isNaN(n))) return true;
    if (a === 0) return true; // unspecified/"this network"
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local (incl. metadata range)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    if (a >= 224) return true; // multicast (224-239) + reserved (240-255)
    return false;
  }

  if (family === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true; // loopback / unspecified
    if (lower.startsWith('::ffff:')) {
      const mapped = lower.slice('::ffff:'.length);
      if (net.isIP(mapped) === 4) return isPrivateIp(mapped);
    }
    if (lower.startsWith('fe80:')) return true; // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local (ULA) fc00::/7
    if (lower.startsWith('ff')) return true; // multicast
    return false;
  }

  // Not a literal IP at all — treat as unsafe by default (caller should have resolved it first).
  return true;
}

async function defaultLookup(hostname: string): Promise<LookupAddress[]> {
  return dns.lookup(hostname, { all: true });
}

/**
 * Validates that `url` is a safe outbound HTTP(S) target: https-only by default, no embedded credentials,
 * no localhost/.local/.internal hostnames, all resolved DNS addresses public (rejects private/loopback/
 * link-local/CGNAT/multicast/unspecified/metadata), and restricted to ports 80/443 unless `allowPorts` is given.
 */
export async function assertPublicHttpUrl(
  url: string,
  options: AssertPublicHttpUrlOptions = {},
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SsrfError('Invalid URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfError(`Unsupported protocol: ${parsed.protocol}`);
  }
  if (parsed.protocol === 'http:' && !options.allowHttp) {
    throw new SsrfError('Plain HTTP is not allowed; use HTTPS.');
  }
  if (parsed.username || parsed.password) {
    throw new SsrfError('URLs with embedded credentials are not allowed.');
  }

  const hostname = parsed.hostname.toLowerCase();
  // WHATWG URL keeps the brackets on IPv6 literals in `.hostname` (e.g. "[fe80::1]") — strip them so
  // net.isIP()/isPrivateIp()/dns.lookup() all see the bare address.
  const bareHost = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;

  if (
    bareHost === 'localhost' ||
    bareHost.endsWith('.localhost') ||
    bareHost.endsWith('.local') ||
    bareHost.endsWith('.internal')
  ) {
    throw new SsrfError('Requests to local/internal hostnames are not allowed.');
  }

  const allowedPorts = options.allowPorts ?? [80, 443];
  const port = parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80;
  if (!allowedPorts.includes(port)) {
    throw new SsrfError(`Port ${port} is not allowed.`);
  }

  const literalFamily = net.isIP(bareHost);
  if (literalFamily !== 0) {
    // Literal IP in the URL: judge it directly, no DNS lookup needed (and dns.lookup on a literal IP
    // just echoes it back anyway).
    if (isPrivateIp(bareHost)) {
      throw new SsrfError('Requests to private/internal IP addresses are not allowed.');
    }
    return parsed;
  }

  const lookup = options.lookup ?? defaultLookup;
  let addresses: LookupAddress[];
  try {
    addresses = await lookup(bareHost);
  } catch (err) {
    throw new SsrfError(`Failed to resolve hostname: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (addresses.length === 0) {
    throw new SsrfError('Hostname did not resolve to any address.');
  }
  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      throw new SsrfError(`Resolved address ${address} is private/internal and not allowed.`);
    }
  }

  return parsed;
}
