import assert from "node:assert/strict";
import { test } from "node:test";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { tmpdir } from "node:os";
import { requestSafeGatewayRestart } from "../dist/audit.js";

// Fake `openclaw` CLI that behaves like releases rejecting --safe with --wait.
function withFakeOpenclaw(fn) {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), "oc-config-gate-bin-"));
    const log = join(dir, "calls.log");
    writeFileSync(
      join(dir, "openclaw"),
      [
        "#!/bin/sh",
        `echo "$*" >> "${log}"`,
        'case " $* " in *" --wait "*) echo "Error: --safe cannot be combined with --wait; safe restart uses gateway deferral" >&2; exit 1;; esac',
        'echo \'{"ok":true}\'',
      ].join("\n"),
    );
    chmodSync(join(dir, "openclaw"), 0o755);
    const savedPath = process.env.PATH;
    process.env.PATH = `${dir}${delimiter}${savedPath}`;
    try {
      await fn(() => readFileSync(log, "utf8").trim().split("\n"));
    } finally {
      process.env.PATH = savedPath;
    }
  };
}

test("safe restart retries without --wait when the CLI rejects the combination", withFakeOpenclaw(async (calls) => {
  const result = await requestSafeGatewayRestart("test");

  assert.equal(result.ok, true);
  assert.match(result.output, /"ok":true/);
  assert.deepEqual(calls(), [
    "gateway restart --safe --wait 5m --json",
    "gateway restart --safe --json",
  ]);
}));
