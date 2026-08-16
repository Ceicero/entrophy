/** Returns a shallow copy of `obj` with every `undefined`-valued key removed — Prisma's `Json` columns reject `undefined` (unlike `null`), and `LogPayload` fields are frequently optional. */
export function pruneUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out = {} as T;
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}
