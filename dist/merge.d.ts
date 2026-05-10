/**
 * JSON Merge Patch (RFC 7396) implementation.
 * Null values in the patch delete keys from the target.
 */
type JsonObject = Record<string, unknown>;
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