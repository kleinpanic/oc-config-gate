import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import plugin from "../dist/plugin.js";
import { clearPending, readPending, writePending } from "../dist/pending.js";

function registerHandler(pluginConfig) {
  let handler;
  plugin.register({
    id: "oc-config-gate",
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    pluginConfig,
    config: {},
    runtime: {},
    registerTool() {},
    registerHook() {},
    registerInteractiveHandler(registration) { handler = registration.handler; },
  });
  return handler;
}

function interaction({ senderId, isAuthorizedSender, payload }) {
  const replies = [];
  const edits = [];
  return {
    replies,
    edits,
    ctx: {
      channel: "discord",
      senderId,
      auth: { isAuthorizedSender },
      interaction: { kind: "button", payload },
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
    const saved = process.env.OC_CONFIG_GATE_PENDING_FILE;
    process.env.OC_CONFIG_GATE_PENDING_FILE = join(dir, "pending-config.json");
    writePending({
      requestId: "req1",
      reason: "test",
      patch: { gateway: {} },
      diffText: "",
      requestedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    try {
      await fn();
    } finally {
      clearPending();
      if (saved === undefined) delete process.env.OC_CONFIG_GATE_PENDING_FILE;
      else process.env.OC_CONFIG_GATE_PENDING_FILE = saved;
    }
  };
}

test("generic OpenClaw sender auth cannot bypass authorizedDiscordUserIds", withPending(async () => {
  const handler = registerHandler({ authorizedDiscordUserIds: ["operator"] });
  const { ctx, replies } = interaction({ senderId: "someone-else", isAuthorizedSender: true, payload: "deny:req1" });

  await handler(ctx);

  assert.match(replies[0]?.text ?? "", /Not authorized/);
  assert.equal(readPending()?.requestId, "req1");
}));

test("configured approver can deny", withPending(async () => {
  const handler = registerHandler({ authorizedDiscordUserIds: ["operator"] });
  const { ctx, edits } = interaction({ senderId: "operator", isAuthorizedSender: false, payload: "deny:req1" });

  await handler(ctx);

  assert.match(edits[0]?.text ?? "", /denied/);
  assert.equal(readPending(), null);
}));

test("OpenClaw sender auth is used only when no approvers are configured", withPending(async () => {
  const handler = registerHandler({ authorizedDiscordUserIds: [] });
  const denied = interaction({ senderId: "x", isAuthorizedSender: false, payload: "deny:req1" });
  await handler(denied.ctx);
  assert.match(denied.replies[0]?.text ?? "", /Not authorized/);

  const allowed = interaction({ senderId: "x", isAuthorizedSender: true, payload: "deny:req1" });
  await handler(allowed.ctx);
  assert.equal(readPending(), null);
}));
