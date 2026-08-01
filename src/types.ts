/**
 * Shared types for oc-config-gate plugin.
 * We define these locally rather than importing from openclaw
 * to avoid a hard dependency on internal paths.
 */

// ─── Plugin API surface (subset we use) ───────────────────────────────────────

export interface PluginLogger {
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
  debug?: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface PluginToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface PluginTool {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute: (
    id: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ) => Promise<PluginToolResult>;
}

export interface PluginInteractiveDiscordHandlerContext {
  channel: "discord";
  accountId: string;
  interactionId: string;
  conversationId: string;
  senderId?: string;
  senderUsername?: string;
  auth: { isAuthorizedSender: boolean };
  interaction: {
    kind: "button" | "select" | "modal";
    data: string;
    namespace: string;
    payload: string;
    messageId?: string;
  };
  respond: {
    acknowledge: () => Promise<void>;
    reply: (params: { text: string; ephemeral?: boolean }) => Promise<void>;
    editMessage: (params: { text?: string; components?: unknown }) => Promise<void>;
    clearComponents: (params?: { text?: string }) => Promise<void>;
  };
}

// ─── Typed hook bus (api.on) ─────────────────────────────────────────────────
// Mirrors openclaw's PluginHookToolContext / PluginHookBeforeToolCallEvent /
// PluginHookBeforeToolCallResult (plugin-sdk hook-types.d.ts:220,230,244 in the
// 2026.5.7 peer floor; unchanged at clone 0790d9f / 2026.7.1).
//
// before_tool_call is dispatched exclusively from registry.typedHooks
// (hooks.ts:285), whose sole write path is api.on -> registerTypedHook
// (registry.ts:3284 -> :2616). api.registerHook reaches the internal hook bus,
// whose closed event namespace does not contain before_tool_call and never
// emits it — a registration there is inert by construction. registerHook is
// deliberately absent from this interface so that bus cannot be reached again.

export interface PluginHookToolContext {
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  runId?: string;
  toolName: string;
  toolCallId?: string;
}

export interface PluginHookBeforeToolCallEvent {
  toolName: string;
  params: Record<string, unknown>;
  runId?: string;
  toolCallId?: string;
  derivedPaths?: readonly string[];
}

export interface PluginHookBeforeToolCallResult {
  params?: Record<string, unknown>;
  block?: boolean;
  blockReason?: string;
}

export type PluginHookBeforeToolCallHandler = (
  event: PluginHookBeforeToolCallEvent,
  ctx: PluginHookToolContext,
) =>
  | Promise<PluginHookBeforeToolCallResult | void>
  | PluginHookBeforeToolCallResult
  | void;

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
  }) => Promise<{ messageId?: string; id?: string }>;
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
  on: (
    hookName: "before_tool_call",
    handler: PluginHookBeforeToolCallHandler,
    opts?: { priority?: number; timeoutMs?: number },
  ) => void;
  registerInteractiveHandler: (registration: {
    channel: "discord";
    namespace: string;
    handler: (
      ctx: PluginInteractiveDiscordHandlerContext,
    ) => Promise<{ handled?: boolean } | void> | ({ handled?: boolean } | void);
  }) => void;
}

// ─── Pending state persisted to disk ─────────────────────────────────────────

export interface PendingConfigRequest {
  requestId: string;
  reason: string;
  patch: Record<string, unknown>;
  restart?: boolean;
  diffText: string;
  requestedAt: string;   // ISO timestamp
  expiresAt: string;     // ISO timestamp
  requestedBy?: string;
  baseHash?: string;
  approvalMessageId?: string;
  approvalChannelId?: string;
}

// ─── Validation result ────────────────────────────────────────────────────────

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

// ─── Plugin config ────────────────────────────────────────────────────────────

export interface OcConfigGatePluginConfig {
  enabled?: boolean;
  approvalChannelId?: string;
  pendingTtlMs?: number;
  restartDelayMs?: number;
  allowGatewayRestart?: boolean;
  authorizedDiscordUserIds?: string[];
  allowedAgentIds?: string[];
}
