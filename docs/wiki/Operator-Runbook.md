# Operator Runbook

## Inspect Runtime Install

```bash
openclaw plugins inspect oc-config-gate --runtime --json
```

Expected surfaces:

- `oc_config_stage`
- `oc_config_apply`
- `oc-config-gate-tool-guard`

## Stage A Change

Meta should call `oc_config_stage` with:

- `patch`: RFC 7396 merge patch.
- `reason`: concrete operator-readable reason.
- `restart`: `true` only when reload is insufficient.

## Approve

Use the Discord approval card buttons. Do not use raw `systemctl`, `/restart-approve`, or token commands.

Approve performs:

```text
validate -> safety-check -> write -> bless -> audit -> optional safe restart
```

## Failure Handling

- `stale base`: another config change landed after staging; stage a fresh patch.
- `validation failed`: fix the config patch, then stage again.
- `safety check failed`: inspect the listed policy violation before retrying.
- `bless failed`: inspect config and signature state before any restart.
