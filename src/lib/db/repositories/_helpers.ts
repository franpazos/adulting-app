/**
 * Shared mapping helpers between SQL row shapes (booleans-as-INTEGER,
 * etc.) and the TS domain types. Keep these adapters in one place so
 * repositories stay focused on intent.
 */

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return crypto.randomUUID();
}

export function toBool(v: unknown): boolean {
  return v === 1 || v === true || v === "1";
}

export function fromBool(v: boolean): 0 | 1 {
  return v ? 1 : 0;
}

/**
 * Map a generic record (whose boolean fields come back as INTEGER 0|1)
 * into a typed shape with real booleans.
 */
export function coerceBooleans<T extends object>(
  row: Record<string, unknown>,
  boolKeys: ReadonlyArray<keyof T>,
): T {
  const out = { ...row } as Record<string, unknown>;
  for (const key of boolKeys) {
    out[key as string] = toBool(out[key as string]);
  }
  return out as T;
}
