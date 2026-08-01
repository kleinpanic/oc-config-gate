# Changelog

## Unreleased

- Closes a detection gap: `apply_patch`, `write`, `edit`, and any other structured
  file-writing tool could target `~/.openclaw/openclaw.json` unblocked, because the
  guard required a shell verb plus a redirect/in-place token that no tool envelope
  contains. Protected files are now matched by PATH — via the host's `derivedPaths`
  hint, the tool's file-target arg keys, and a local parse of the `apply_patch`
  envelope — with command-string matching kept as the fallback for `exec`/`bash`.
- Blocks the `gateway` tool's structured `action: "restart"`, which reached the same
  outcome as a raw `systemctl` restart without matching any command-string pattern.
- Reads of the config remain allowed; `meta` (and any configured `allowedAgentIds`)
  keeps its exemption across every newly covered tool shape.

## 1.0.0 - 2026-05-09

- Consolidates the prior `oc-restart`, `oc-config-gate`, and shell-only config guardian flows into one OpenClaw plugin surface.
- Adds `oc_config_stage` for RFC 7396 config patches with native Discord approval buttons.
- Adds `oc_config_apply` as a status-only agent tool; actual apply/deny remains button-driven.
- Blocks non-meta direct config edits, direct config/update/restart RPCs, and raw gateway restarts through an official `before_tool_call` hook.
- Applies approved changes by rechecking base hash, validating, safety-checking, writing, blessing, and auditing.
- Supports explicit approved safe restarts via `restart: true`, using `openclaw gateway restart --safe --wait 5m --json`.
- Removes deprecated text-token commands such as `approve-restart` and `/restart-approve`.

