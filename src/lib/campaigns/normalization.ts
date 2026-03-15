const NON_ALPHANUMERIC = /[^a-z0-9]+/g;
const MULTI_WHITESPACE = /\s+/g;

export function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['\"]/g, "")
    .replace(NON_ALPHANUMERIC, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function normalizeBusinessName(value: string): string {
  return value.trim().toLowerCase().replace(MULTI_WHITESPACE, " ");
}

export function normalizeDomain(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim().toLowerCase();

  if (!trimmed) {
    return null;
  }

  try {
    const url = trimmed.includes("://") ? new URL(trimmed) : new URL(`https://${trimmed}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    const withoutMailPrefix = trimmed.replace(/^mailto:/, "");
    if (withoutMailPrefix.includes("@")) {
      const domain = withoutMailPrefix.split("@").at(-1);
      return domain ? domain.replace(/^www\./, "") : null;
    }

    return withoutMailPrefix.replace(/^www\./, "");
  }
}

export function toNullableTrimmed(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function pickDeterministic<T>(items: readonly T[], seed: string): T {
  if (items.length === 0) {
    throw new Error("Cannot pick from an empty list.");
  }

  const index = hashString(seed) % items.length;
  return items[index] as T;
}
