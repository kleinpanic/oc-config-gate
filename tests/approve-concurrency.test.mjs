import assert from "node:assert/strict";
import { test } from "node:test";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// audit.ts resolves HOME at import time, so point it at a sandbox with a slow
// fake config guardian before loading the plugin.
const home = mkdtempSync(join(tmpdir(), "oc-config-gate-home-"));
mkdirSync(join(home, ".openclaw", "hooks"), { recursive: true });
const guardian = join(home, ".openclaw", "hooks", "config-guardian.sh");
writeFileSync(guardian, "#!/bin/sh\nsleep 0.3\nexit 0\n");
chmodSync(guardian, 0o755);
process.env.HOME = home;
process.env.OPENCLAW_CONFIG_PATH = join(home, ".openclaw", "openclaw.json");
process.env.OC_CONFIG_GATE_PENDING_FILE = join(home, ".openclaw", "runtime", "pending-config.json");
writeFileSync(
  process.env.OPENCLAW_CONFIG_PATH,
  `${JSON.stringify({ agents: { list: [{ id: "meta", model: "m" }] }, plugins: { allow: [] } })}\n`,
);

const { default: plugin } = await import("../dist/plugin.js");
const { writePending } = await import("../dist/pending.js");

test("a second Approve click while applying does not apply twice", async () => {
  let writes = 0;
  let handler;
  plugin.register({
    id: "oc-config-gate",
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    pluginConfig: { authorizedDiscordUserIds: ["operator"] },
    config: {},
    runtime: { config: { loadConfig() { return {}; }, async writeConfigFile() { writes += 1; } } },
    registerTool() {},
    registerHook() {},
    registerInteractiveHandler(registration) { handler = registration.handler; },
  });
  writePending({
    requestId: "req1",
    reason: "test",
    patch: { gateway: { reload: { mode: "hybrid" } } },
    diffText: "",
    requestedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  const click = () => {
    const replies = [];
    const ctx = {
      channel: "discord",
      senderId: "operator",
      auth: { isAuthorizedSender: false },
      interaction: { kind: "button", payload: "approve:req1" },
      respond: {
        async acknowledge() {},
        async reply(p) { replies.push(p.text); },
        async editMessage(p) { replies.push(p.text); },
        async clearComponents(p) { replies.push(p.text); },
      },
    };
    return handler(ctx).then(() => replies);
  };

  const [first, second] = await Promise.all([click(), click()]);

  assert.equal(writes, 1);
  assert.match(first.at(-1), /Config applied/);
  assert.match(second.join("\n"), /already being applied/);
});
