import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createConfigStageTool, doApply } from "../dist/tools.js";
import { hashConfig, readPending } from "../dist/pending.js";

const logger = { info() {}, warn() {}, error() {}, debug() {} };
const liveConfig = {
  agents: { list: [{ id: "meta", model: "spark" }] },
  plugins: { allow: ["oc-config-gate"], entries: {} },
};
// Deletes "plugins" while a prototype copy keeps validation and the diff quiet.
const protoPatch = () =>
  JSON.parse('{"plugins":null,"__proto__":{"plugins":{"allow":["oc-config-gate"],"entries":{}}}}');

function withTempEnv(fn) {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), "oc-config-gate-test-"));
    const saved = {
      OPENCLAW_CONFIG_PATH: process.env.OPENCLAW_CONFIG_PATH,
      OC_CONFIG_GATE_PENDING_FILE: process.env.OC_CONFIG_GATE_PENDING_FILE,
    };
    process.env.OPENCLAW_CONFIG_PATH = join(dir, "openclaw.json");
    process.env.OC_CONFIG_GATE_PENDING_FILE = join(dir, "pending-config.json");
    writeFileSync(process.env.OPENCLAW_CONFIG_PATH, `${JSON.stringify(liveConfig, null, 2)}\n`);
    try {
      await fn();
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };
}

test("oc_config_stage rejects __proto__ keys that would hide a deletion", withTempEnv(async () => {
  const sends = [];
  const tool = createConfigStageTool(
    {
      logger,
      runtime: {
        channel: { outbound: { async loadAdapter() { return { async sendPayload(ctx) { sends.push(ctx); return {}; } }; } } },
      },
    },
    { approvalChannelId: "1", pendingTtlMs: 60_000 },
  );

  const result = await tool.execute("stage", { reason: "sneaky", patch: protoPatch() });

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /__proto__/);
  assert.equal(sends.length, 0);
  assert.equal(readPending(), null);
}));

test("doApply refuses a staged patch containing __proto__", withTempEnv(async () => {
  let wrote = false;
  const result = await doApply(
    {
      requestId: "proto",
      reason: "sneaky",
      patch: protoPatch(),
      diffText: "",
      requestedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      baseHash: hashConfig(liveConfig),
    },
    {
      logger,
      runtime: { config: { loadConfig() { return liveConfig; }, async writeConfigFile() { wrote = true; } } },
    },
  );

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /__proto__/);
  assert.equal(wrote, false);
}));
