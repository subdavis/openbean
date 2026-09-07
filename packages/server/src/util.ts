export const now = () => new Date().toISOString();

/** Trimmed string within bounds, or null if absent/blank/oversized. */
export function text(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 && s.length <= max ? s : null;
}

export const isDate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

export const randomCode = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);
