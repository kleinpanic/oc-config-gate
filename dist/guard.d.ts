import type { OpenClawPluginApi } from "./types.js";
/**
 * Which branch denied. Interpolated into the journal line so a block is
 * self-identifying — see registerConfigGuardHook. Never carries params.
 */
export type GuardBlockCategory = "config-rpc" | "protected-path" | "gateway-restart-action" | "config-write-command" | "gateway-restart-command";
export interface GuardDecision {
    block: boolean;
    reason?: string;
    category?: GuardBlockCategory;
}
export declare function shouldBlockToolCall(params: {
    agentId?: string;
    toolName?: string;
    payload?: unknown;
    /**
     * Host-derived destination path hints from the before_tool_call event
     * (clone 0790d9f, src/plugins/hook-types.ts:660-671). Populated today only
     * for `apply_patch` (src/plugins/host-tool-param-parsers.ts:32-35) and
     * documented as a lenient hint, so it is treated as one signal among several
     * — never as the sole parse.
     */
    derivedPaths?: readonly string[];
    allowedAgentIds?: string[];
}): GuardDecision;
export declare function registerConfigGuardHook(api: OpenClawPluginApi, allowedAgentIds?: string[]): void;
//# sourceMappingURL=guard.d.ts.map