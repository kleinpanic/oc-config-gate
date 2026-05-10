import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createConfigStageTool } from "../dist/tools.js";
import { clearPending, readPending } from "../dist/pending.js";

test("oc_config_stage posts approval card through official Discord outbound adapter", async () => {
  const sends = [];
  const liveConfig = {
    agents: { list: [{ id: "meta", model: "spark" }] },
    plugins: { allow: ["oc-config-gate"], entries: { "oc-config-gate": { enabled: true } } },
    gateway: { reload: { mode: "hybrid" } },
  };
  const dir = mkdtempSync(join(tmpdir(), "oc-config-gate-test-"));
  const configPath = join(dir, "openclaw.json");
  const pendingPath = join(dir, "pending-config.json");
  const oldConfigPath = process.env.OPENCLAW_CONFIG_PATH;
  const oldPendingPath = process.env.OC_CONFIG_GATE_PENDING_FILE;
  process.env.OPENCLAW_CONFIG_PATH = configPath;
  process.env.OC_CONFIG_GATE_PENDING_FILE = pendingPath;
  writeFileSync(configPath, `${JSON.stringify(liveConfig, null, 2)}\n`);

  const tool = createConfigStageTool(
    {
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      runtime: {
        config: {
          loadConfig() {
            return liveConfig;
          },
          async writeConfigFile() {},
        },
        channel: {
          outbound: {
            async loadAdapter(channel) {
              assert.equal(channel, "discord");
              return {
                async sendPayload(ctx) {
                  sends.push(ctx);
                  return { messageId: "discord-message-1" };
                },
              };
            },
          },
        },
      },
    },
    {
      approvalChannelId: "1474492327748960378",
      pendingTtlMs: 60_000,
      authorizedDiscordUserIds: ["1014431070059503699"],
    },
  );

  try {
    const result = await tool.execute("stage", {
      reason: "test official discord adapter",
      patch: { gateway: { reload: { debounceMs: 300 } } },
    });

    assert.equal(result.isError, false);
    assert.equal(sends.length, 1);
    assert.equal(sends[0].to, "channel:1474492327748960378");
    assert.match(sends[0].text, /Change Summary/);
    const actionBlock = sends[0].payload.channelData.discord.components.blocks.at(-1);
    assert.equal(actionBlock.buttons[0].callbackData.startsWith("oc-config-gate:approve:"), true);
    assert.deepEqual(
      actionBlock.buttons[0].allowedUsers,
      ["1014431070059503699"],
    );
    assert.equal(readPending()?.approvalMessageId, "discord-message-1");
  } finally {
    clearPending();
    if (oldConfigPath === undefined) delete process.env.OPENCLAW_CONFIG_PATH;
    else process.env.OPENCLAW_CONFIG_PATH = oldConfigPath;
    if (oldPendingPath === undefined) delete process.env.OC_CONFIG_GATE_PENDING_FILE;
    else process.env.OC_CONFIG_GATE_PENDING_FILE = oldPendingPath;
  }
});

test("oc_config_stage can request a post-approval safe restart", async () => {
  const sends = [];
  const liveConfig = {
    agents: { list: [{ id: "meta", model: "spark" }] },
    plugins: { allow: ["oc-config-gate"], entries: { "oc-config-gate": { enabled: true } } },
    gateway: { reload: { mode: "off" } },
  };
  const dir = mkdtempSync(join(tmpdir(), "oc-config-gate-test-"));
  const configPath = join(dir, "openclaw.json");
  const pendingPath = join(dir, "pending-config.json");
  const oldConfigPath = process.env.OPENCLAW_CONFIG_PATH;
  const oldPendingPath = process.env.OC_CONFIG_GATE_PENDING_FILE;
  process.env.OPENCLAW_CONFIG_PATH = configPath;
  process.env.OC_CONFIG_GATE_PENDING_FILE = pendingPath;
  writeFileSync(configPath, `${JSON.stringify(liveConfig, null, 2)}\n`);

  const tool = createConfigStageTool(
    {
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      runtime: {
        channel: {
          outbound: {
            async loadAdapter() {
              return {
                async sendPayload(ctx) {
                  sends.push(ctx);
                  return { messageId: "discord-message-restart" };
                },
              };
            },
          },
        },
      },
    },
    {
      approvalChannelId: "1474492327748960378",
      pendingTtlMs: 60_000,
      authorizedDiscordUserIds: ["1014431070059503699"],
      allowGatewayRestart: true,
    },
  );

  try {
    const result = await tool.execute("stage", {
      reason: "test restart card",
      patch: { gateway: { reload: { mode: "hybrid" } } },
      restart: true,
    });

    assert.equal(result.isError, false);
    assert.equal(readPending()?.restart, true);
    assert.match(sends[0].text, /official safe gateway restart/);
    assert.match(result.content[0].text, /official safe gateway restart/);
  } finally {
    clearPending();
    if (oldConfigPath === undefined) delete process.env.OPENCLAW_CONFIG_PATH;
    else process.env.OPENCLAW_CONFIG_PATH = oldConfigPath;
    if (oldPendingPath === undefined) delete process.env.OC_CONFIG_GATE_PENDING_FILE;
    else process.env.OC_CONFIG_GATE_PENDING_FILE = oldPendingPath;
  }
});
