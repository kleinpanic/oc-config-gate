/**
 * Pending config request state management.
 * Reads/writes ~/.openclaw/runtime/pending-config.json
 */
import type { PendingConfigRequest } from "./types.js";
export declare function generateRequestId(): string;
export declare function hashConfig(config: unknown): string;
export declare function writePending(req: PendingConfigRequest): void;
export declare function readPending(): PendingConfigRequest | null;
export declare function clearPending(): void;
export declare function isPendingExpired(req: PendingConfigRequest): boolean;
//# sourceMappingURL=pending.d.ts.map