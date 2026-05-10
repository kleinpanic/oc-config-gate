/**
 * Shared types for oc-config-gate plugin.
 * We define these locally rather than importing from openclaw
 * to avoid a hard dependency on internal paths.
 */
export interface PluginLogger {
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
    debug?: (msg: string, meta?: Record<string, unknown>) => void;
}
export interface PluginToolResult {
    content: Array<{
        type: "text";
        text: string;
    }>;
    isError?: boolean;
}
export interface PluginTool {
    name: string;
    label: string;
    description: string;
    parameters: unknown;
    execute: (id: string, params: Record<string, unknown>, signal?: AbortSignal) => Promise<PluginToolResult>;
}
export interface PluginInteractiveDiscordHandlerContext {
    channel: "discord";
    accountId: string;
    interactionId: string;
    conversationId: string;
    senderId?: string;
    senderUsername?: string;
    auth: {
        isAuthorizedSender: boolean;
    };
    interaction: {
        kind: "button" | "select" | "modal";
        data: string;
        namespace: string;
        payload: string;
        messageId?: string;
    };
    respond: {
        acknowledge: () => Promise<void>;
        reply: (params: {
            text: string;
            ephemeral?: boolean;
        }) => Promise<void>;
        editMessage: (params: {
            text?: string;
            components?: unknown;
        }) => Promise<void>;
        clearComponents: (params?: {
            text?: string;
        }) => Promise<void>;
    };
}
export interface ChannelOutboundAdapter {
    sendPayload?: (ctx: {
        cfg: unknown;
        to: string;
        text: string;
        payload: {
            text?: string;
            channelData?: Record<string, unknown>;
        };
        accountId?: string | null;
        threadId?: string | number | null;
        silent?: boolean;
    }) => Promise<{
        messageId?: string;
        id?: string;
    }>;
}
export interface PluginRuntime {
    config?: {
        loadConfig: () => unknown;
        writeConfigFile: (cfg: unknown, opts?: unknown) => Promise<void>;
    };
    channel?: {
        outbound?: {
            loadAdapter?: (channel: string) => Promise<ChannelOutboundAdapter | undefined> | ChannelOutboundAdapter | undefined;
        };
    };
}
export interface OpenClawPluginApi {
    id: string;
    logger: PluginLogger;
    pluginConfig?: Record<string, unknown>;
    config: unknown;
    runtime?: PluginRuntime;
    registerTool: (tool: PluginTool) => void;
    registerHook?: (events: string | string[], handler: (event: unknown, ctx: Record<string, unknown>) => Promise<unknown> | unknown, opts?: Record<string, unknown>) => void;
    registerInteractiveHandler: (registration: {
        channel: "discord";
        namespace: string;
        handler: (ctx: PluginInteractiveDiscordHandlerContext) => Promise<{
            handled?: boolean;
        } | void> | ({
            handled?: boolean;
        } | void);
    }) => void;
}
export interface PendingConfigRequest {
    requestId: string;
    reason: string;
    patch: Record<string, unknown>;
    restart?: boolean;
    diffText: string;
    requestedAt: string;
    expiresAt: string;
    requestedBy?: string;
    baseHash?: string;
    approvalMessageId?: string;
    approvalChannelId?: string;
}
export interface ValidationResult {
    ok: boolean;
    errors: string[];
    warnings: string[];
}
export interface OcConfigGatePluginConfig {
    enabled?: boolean;
    approvalChannelId?: string;
    pendingTtlMs?: number;
    restartDelayMs?: number;
    allowGatewayRestart?: boolean;
    authorizedDiscordUserIds?: string[];
    allowedAgentIds?: string[];
}
//# sourceMappingURL=types.d.ts.map