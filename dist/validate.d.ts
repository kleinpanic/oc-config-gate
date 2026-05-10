/**
 * Config validation logic for oc-config-gate.
 *
 * Validates a proposed merged config against:
 *   1. Required top-level sections still present
 *   2. Agent list not shrunk (agents cannot be silently removed)
 *   3. Plugin allowlist not shrunk (plugins cannot be silently removed)
 *   4. No raw hardcoded API keys (must use ${ENV_VAR} template syntax)
 *   5. agents.list entries each have required fields (id, model)
 *   6. Known bool/string fields have correct types
 */
import type { ValidationResult } from "./types.js";
export declare function validateMergedConfig(before: unknown, after: unknown): ValidationResult;
//# sourceMappingURL=validate.d.ts.map