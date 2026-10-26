/**
 * JSON Merge Patch (RFC 7396) implementation.
 * Null values in the patch delete keys from the target.
 */
type JsonObject = Record<string, unknown>;
/**
 * Return the path of the first "__proto__" key in a patch, or null.
 * JSON.parse creates it as an own key, but assigning it during the merge
 * swaps the result's prototype instead of setting a field: the change is
 * dropped from the written config yet still satisfies `in` checks, so the
 * diff and validation would not reflect what actually gets written.
 */
export declare function findUnsafePatchKey(patch: unknown, prefix?: string): string | null;
/**
 * Apply a JSON Merge Patch to a target object.
 * Returns a new deep-merged object (does not mutate inputs).
 * Null values in the patch delete the corresponding key.
 */
export declare function applyMergePatch(target: unknown, patch: unknown): JsonObject;
/**
 * Produce a flat list of changed paths for display in the diff.
 * Returns entries like: "agents.list[0].model: old → new"
 */
export declare function summarizePatchPaths(before: unknown, after: unknown, prefix?: string): string[];
export {};
//# sourceMappingURL=merge.d.ts.map