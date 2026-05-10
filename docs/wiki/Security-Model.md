# Security Model

`oc-config-gate` assumes config writes and gateway restarts are high-risk operations.

## Controls

- Non-meta agents are blocked from direct `openclaw.json` edits.
- Non-meta agents are blocked from direct config RPC and raw restart commands.
- Pending requests expire.
- Approvals are restricted to configured Discord user IDs.
- Apply rechecks the base config hash to prevent stale writes.
- The plugin reads raw file config to preserve `${ENV_VAR}` placeholders.
- Audit events are appended to `~/.openclaw/runtime/oc-config-gate-audit.jsonl`.

## Limits

This is a policy gate, not a full shell sandbox. High-trust agents still need disciplined bootstrap instructions and review.
