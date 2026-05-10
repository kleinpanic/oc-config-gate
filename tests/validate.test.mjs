import assert from "node:assert/strict";
import { test } from "node:test";
import { validateMergedConfig } from "../dist/validate.js";

test("validator accepts official provider catalog entries with env-referenced keys", () => {
  const cfg = {
    agents: { list: [{ id: "meta", model: "gpt-5.5" }] },
    plugins: { allow: ["oc-config-gate"] },
    models: {
      providers: {
        openai: { apiKey: "${OPENAI_MODEL_API_KEY}", models: [{ id: "gpt-5.5" }] },
        "openai-codex": { models: [{ id: "gpt-5.5", alias: "gpt-5.5-codex" }] },
        anthropic: { models: [{ id: "claude-sonnet-4-5" }] },
      },
    },
  };

  const result = validateMergedConfig(cfg, cfg);

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});
