import assert from "node:assert/strict";
import { test } from "node:test";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { requestSafeGatewayRestart } from "../dist/audit.js";

test("safe restart does not pass --wait, which openclaw rejects with --safe", async () => {
  const dir = mkdtempSync(join(tmpdir(), "oc-config-gate-test-"));
  const argsPath = join(dir, "args.json");
  // Fake openclaw CLI that mirrors the real `gateway restart` flag check.
  writeFileSync(
    join(dir, "openclaw"),
    [
      "#!/usr/bin/env node",
      "const args = process.argv.slice(2);",
      `require("node:fs").writeFileSync(${JSON.stringify(argsPath)}, JSON.stringify(args));`,
      "if (args.includes('--safe') && args.includes('--wait')) {",
      "  console.error('--safe cannot be combined with --wait; safe restart uses gateway deferral');",
      "  process.exit(1);",
      "}",
      "console.log(JSON.stringify({ ok: true, result: 'scheduled' }));",
    ].join("\n"),
  );
  chmodSync(join(dir, "openclaw"), 0o755);
  const oldPath = process.env.PATH;
  process.env.PATH = `${dir}:${oldPath}`;
  try {
    const result = await requestSafeGatewayRestart("test");
    assert.equal(result.ok, true, result.ok ? "" : result.error);
    assert.deepEqual(JSON.parse(readFileSync(argsPath, "utf8")), ["gateway", "restart", "--safe", "--json"]);
  } finally {
    process.env.PATH = oldPath;
  }
});
