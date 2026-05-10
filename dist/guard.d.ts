import type { OpenClawPluginApi } from "./types.js";
export interface GuardDecision {
    block: boolean;
    reason?: string;
}
export declare function shouldBlockToolCall(params: {
    agentId?: string;
    toolName?: string;
    payload?: unknown;
    allowedAgentIds?: string[];
}): GuardDecision;
export declare function registerConfigGuardHook(api: OpenClawPluginApi, allowedAgentIds?: string[]): void;
//# sourceMappingURL=guard.d.ts.map