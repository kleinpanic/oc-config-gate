# Old oc-restart Migration

`oc-config-gate` supersedes the old split restart/config control plane.

## Ported

- Discord approval gate
- Authorized operator checks
- Pending request state
- Audit log writes
- Direct restart blocking
- Approved safe restart path

## Removed

- `/restart-approve` and `/restart-deny`
- `approve-restart` text tokens
- Raw shell restart fallback
- Separate restart-only pending file
- Deprecated gateway monkeypatching

## Current Rule

All config changes and restart requests should flow through `oc_config_stage` and the Discord approval card.
