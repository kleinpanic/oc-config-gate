import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createConfigApplyTool, doApply } from "../dist/tools.js";
import { clearPending, writePending } from "../dist/pending.js";

test("agent-facing oc_config_apply is status-only", async () => {
  const dir = mkdtempSync(join(tmpdir(), "oc-config-gate-test-"));
  const oldPendingPath = process.env.OC_CONFIG_GATE_PENDING_FILE;
  process.env.OC_CONFIG_GATE_PENDING_FILE = join(dir, "pending-config.json");
  writePending({
    requestId: "status-only-test",
    reason: "test",
    patch: { plugins: {} },
    diffText: "plugins: changed",
    requestedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    baseHash: "test",
  });
  const tool = createConfigApplyTool({
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    runtime: {},
  });

  try {
    const result = await tool.execute("test", { action: "apply" });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /status-only/);
  } finally {
    clearPending();
    if (oldPendingPath === undefined) delete process.env.OC_CONFIG_GATE_PENDING_FILE;
    else process.env.OC_CONFIG_GATE_PENDING_FILE = oldPendingPath;
  }
});

test("doApply rejects stale staged requests before writing", async () => {
  let wrote = false;
  const dir = mkdtempSync(join(tmpdir(), "oc-config-gate-test-"));
  const configPath = join(dir, "openclaw.json");
  const oldConfigPath = process.env.OPENCLAW_CONFIG_PATH;
  process.env.OPENCLAW_CONFIG_PATH = configPath;
  writeFileSync(
    configPath,
    `${JSON.stringify({ agents: { list: [] }, plugins: { allow: [], entries: {} } }, null, 2)}\n`,
  );
  try {
    const result = await doApply(
      {
        requestId: "stale",
        reason: "test stale request",
        patch: { plugins: { entries: { demo: { enabled: true } } } },
        diffText: "plugins.entries.demo: added",
        requestedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        baseHash: "not-the-current-hash",
      },
      {
        logger: { info() {}, warn() {}, error() {}, debug() {} },
        runtime: {
          config: {
            loadConfig() {
              return { agents: { list: [] }, plugins: { allow: [], entries: {} } };
            },
            async writeConfigFile() {
              wrote = true;
            },
          },
        },
      },
    );

    assert.equal(result.isError, true);
    assert.equal(wrote, false);
    assert.match(result.content[0].text, /Config changed after this request was staged/);
  } finally {
    if (oldConfigPath === undefined) delete process.env.OPENCLAW_CONFIG_PATH;
    else process.env.OPENCLAW_CONFIG_PATH = oldConfigPath;
  }
});
