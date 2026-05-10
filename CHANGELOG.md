# Changelog

## 1.0.0 - 2026-05-09

- Consolidates the prior `oc-restart`, `oc-config-gate`, and shell-only config guardian flows into one OpenClaw plugin surface.
- Adds `oc_config_stage` for RFC 7396 config patches with native Discord approval buttons.
- Adds `oc_config_apply` as a status-only agent tool; actual apply/deny remains button-driven.
- Blocks non-meta direct config edits, direct config/update/restart RPCs, and raw gateway restarts through an official `before_tool_call` hook.
- Applies approved changes by rechecking base hash, validating, safety-checking, writing, blessing, and auditing.
- Supports explicit approved safe restarts via `restart: true`, using `openclaw gateway restart --safe --wait 5m --json`.
- Removes deprecated text-token commands such as `approve-restart` and `/restart-approve`.

