import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import plugin from "../dist/plugin.js";
import { clearPending, readPending, writePending } from "../dist/pending.js";

function registerHandler(pluginConfig) {
  const handlers = [];
  plugin.register({
    id: "oc-config-gate",
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    pluginConfig,
    config: {},
    runtime: {},
    registerTool() {},
    registerHook() {},
    registerInteractiveHandler(handler) { handlers.push(handler); },
  });
  return handlers[0].handler;
}

function makeCtx({ senderId, isAuthorizedSender, payload }) {
  const replies = [];
  const edits = [];
  return {
    replies,
    edits,
    ctx: {
      channel: "discord",
      accountId: "default",
      interactionId: "i1",
      conversationId: "c1",
      senderId,
      auth: { isAuthorizedSender },
      interaction: { kind: "button", data: `oc-config-gate:${payload}`, namespace: "oc-config-gate", payload },
      respond: {
        async acknowledge() {},
        async reply(p) { replies.push(p); },
        async editMessage(p) { edits.push(p); },
        async clearComponents(p) { edits.push(p); },
      },
    },
  };
}

function withPending(fn) {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), "oc-config-gate-test-"));
    const oldPendingPath = process.env.OC_CONFIG_GATE_PENDING_FILE;
    process.env.OC_CONFIG_GATE_PENDING_FILE = join(dir, "pending-config.json");
    writePending({
      requestId: "abc123",
      reason: "test",
      patch: { gateway: { reload: { mode: "hybrid" } } },
      diffText: "gateway.reload.mode: changed",
      requestedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      baseHash: "test",
    });
    try {
      await fn();
    } finally {
      clearPending();
      if (oldPendingPath === undefined) delete process.env.OC_CONFIG_GATE_PENDING_FILE;
      else process.env.OC_CONFIG_GATE_PENDING_FILE = oldPendingPath;
    }
  };
}

test("channel-authorized sender outside authorizedDiscordUserIds cannot deny", withPending(async () => {
  const handler = registerHandler({ authorizedDiscordUserIds: ["111"] });
  const { ctx, replies, edits } = makeCtx({ senderId: "222", isAuthorizedSender: true, payload: "deny:abc123" });
  await handler(ctx);
  assert.match(replies[0]?.text ?? "", /Not authorized/);
  assert.equal(edits.length, 0);
  assert.equal(readPending()?.requestId, "abc123");
}));

test("configured operator can deny", withPending(async () => {
  const handler = registerHandler({ authorizedDiscordUserIds: ["111"] });
  const { ctx, edits } = makeCtx({ senderId: "111", isAuthorizedSender: false, payload: "deny:abc123" });
  await handler(ctx);
  assert.match(edits[0]?.text ?? "", /denied/);
  assert.equal(readPending(), null);
}));

test("empty authorizedDiscordUserIds falls back to OpenClaw sender auth", withPending(async () => {
  const handler = registerHandler({ authorizedDiscordUserIds: [] });
  const denied = makeCtx({ senderId: "222", isAuthorizedSender: false, payload: "deny:abc123" });
  await handler(denied.ctx);
  assert.match(denied.replies[0]?.text ?? "", /Not authorized/);
  assert.equal(readPending()?.requestId, "abc123");

  const allowed = makeCtx({ senderId: "222", isAuthorizedSender: true, payload: "deny:abc123" });
  await handler(allowed.ctx);
  assert.equal(readPending(), null);
}));
