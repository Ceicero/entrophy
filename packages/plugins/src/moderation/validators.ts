export type EvidenceParseResult = { ok: true; urls: string[] } | { ok: false; error: string };

const MAX_EVIDENCE_URLS = 10;

/** Parses a comma-separated evidence-links option into validated http(s) URLs (link-only — no content is fetched or stored). */
export function parseEvidenceUrls(raw: string | null | undefined): EvidenceParseResult {
  if (!raw || raw.trim().length === 0) return { ok: true, urls: [] };

  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length > MAX_EVIDENCE_URLS) {
    return { ok: false, error: `At most ${MAX_EVIDENCE_URLS} evidence links are allowed.` };
  }

  const urls: string[] = [];
  for (const part of parts) {
    let parsed: URL;
    try {
      parsed = new URL(part);
    } catch {
      return { ok: false, error: `"${part}" isn't a valid URL.` };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: `"${part}" must be an http(s) link.` };
    }
    urls.push(parsed.toString());
  }

  return { ok: true, urls };
}
