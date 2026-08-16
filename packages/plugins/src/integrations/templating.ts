/** Dot-path lookup into a JSON-ish payload (`getByPath({a:{b:1}}, 'a.b') === 1`). Returns `undefined` on any miss. */
export function getByPath(payload: unknown, path: string): unknown {
  const parts = path.split('.').filter(Boolean);
  let cur: unknown = payload;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/**
 * Fills `{dot.path}` placeholders in `template` from `payload` (generic inbound webhook message templating,
 * SPEC.md §J). A placeholder that resolves to `undefined`/`null` is left as literal text (so a typo'd path is
 * visible rather than silently vanishing); object/array values are JSON-stringified.
 */
export function renderTemplate(template: string, payload: unknown): string {
  return template.replace(/\{([\w.]+)\}/g, (match, path: string) => {
    const value = getByPath(payload, path);
    if (value === undefined || value === null) return match;
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  });
}

const MAX_JSON_PREVIEW_CHARS = 900;

/** Default rendering for a generic inbound webhook with no configured template: a fenced JSON preview. */
export function renderDefaultPayloadPreview(eventType: string, payload: unknown): string {
  let json: string;
  try {
    json = JSON.stringify(payload, null, 2);
  } catch {
    json = String(payload);
  }
  if (json.length > MAX_JSON_PREVIEW_CHARS) {
    json = `${json.slice(0, MAX_JSON_PREVIEW_CHARS)}\n… (truncated)`;
  }
  return `**Event:** \`${eventType}\`\n\`\`\`json\n${json}\n\`\`\``;
}
