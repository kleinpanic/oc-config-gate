/**
 * JSON Merge Patch (RFC 7396) implementation.
 * Null values in the patch delete keys from the target.
 */

type JsonObject = Record<string, unknown>;

function isObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Apply a JSON Merge Patch to a target object.
 * Returns a new deep-merged object (does not mutate inputs).
 * Null values in the patch delete the corresponding key.
 */
export function applyMergePatch(
  target: unknown,
  patch: unknown,
): JsonObject {
  if (!isObject(patch)) {
    // Non-object patch replaces the whole target — not typical but spec-compliant
    return (isObject(target) ? { ...target } : {}) as JsonObject;
  }

  const result: JsonObject = isObject(target) ? { ...target } : {};

  for (const key of Object.keys(patch)) {
    const patchVal = (patch as JsonObject)[key];
    if (patchVal === null) {
      // RFC 7396: null means delete the key
      delete result[key];
    } else if (isObject(patchVal) && isObject(result[key])) {
      // Recurse into nested objects
      result[key] = applyMergePatch(result[key], patchVal);
    } else {
      result[key] = patchVal;
    }
  }

  return result;
}

/**
 * Produce a flat list of changed paths for display in the diff.
 * Returns entries like: "agents.list[0].model: old → new"
 */
export function summarizePatchPaths(
  before: unknown,
  after: unknown,
  prefix = "",
): string[] {
  const lines: string[] = [];

  if (!isObject(before) || !isObject(after)) {
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      lines.push(`${prefix || "<root>"}: ${fmtVal(before)} → ${fmtVal(after)}`);
    }
    return lines;
  }

  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    const p = prefix ? `${prefix}.${key}` : key;
    const bv = before[key];
    const av = after[key];

    if (!(key in after)) {
      lines.push(`${p}: ${fmtVal(bv)} → (deleted)`);
    } else if (!(key in before)) {
      lines.push(`${p}: (added) → ${fmtVal(av)}`);
    } else if (isObject(bv) && isObject(av)) {
      lines.push(...summarizePatchPaths(bv, av, p));
    } else if (Array.isArray(bv) && Array.isArray(av)) {
      if (JSON.stringify(bv) !== JSON.stringify(av)) {
        lines.push(`${p}: [array changed — ${bv.length} items → ${av.length} items]`);
      }
    } else if (JSON.stringify(bv) !== JSON.stringify(av)) {
      lines.push(`${p}: ${fmtVal(bv)} → ${fmtVal(av)}`);
    }
  }

  return lines;
}

function fmtVal(v: unknown): string {
  if (v === undefined) return "(undefined)";
  if (v === null) return "null";
  if (typeof v === "string") return v.length > 60 ? `"${v.slice(0, 57)}..."` : `"${v}"`;
  if (typeof v === "object") return Array.isArray(v) ? `[${(v as unknown[]).length} items]` : "{…}";
  return String(v);
}
