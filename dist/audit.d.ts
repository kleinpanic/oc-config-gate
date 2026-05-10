export declare function appendAudit(entry: Record<string, unknown>): void;
export declare function blessConfig(reason: string): Promise<{
    ok: true;
} | {
    ok: false;
    error: string;
}>;
export declare function safetyCheckConfig(config: unknown): Promise<{
    ok: true;
} | {
    ok: false;
    error: string;
}>;
export declare function requestSafeGatewayRestart(reason: string): Promise<{
    ok: true;
    output: string;
} | {
    ok: false;
    error: string;
}>;
//# sourceMappingURL=audit.d.ts.map