# Security Model

`oc-config-gate` protects the OpenClaw config file from unapproved agent edits and restart loops. It assumes that high-permission agents may have shell access but still need a policy gate before modifying gateway-critical state.

## Threats

| Threat | Mitigation |
|--------|------------|
| Non-meta agent edits `openclaw.json` directly | `before_tool_call` hook blocks common direct write patterns. |
| Agent calls config/restart RPC directly | Hook blocks config/update/restart RPC method strings. |
| Agent restarts gateway with raw systemd | Hook blocks raw systemd/pkill/openclaw restart commands for non-allowed agents. |
| Stale approval applies over newer config | Apply rechecks the live config hash against staged base hash. |
| Runtime config write resolves secrets into file | Stage/apply reads raw file config, not resolved runtime config. |
| Unauthorized Discord user approves | Interactive handler checks OpenClaw auth and configured Discord user IDs. |
| Approval card replay after expiry | Pending request TTL is enforced and expired requests are cleared. |

## Trust Boundaries

| Boundary | Trusted | Notes |
|----------|---------|-------|
| `allowedAgentIds` | high-trust agents, usually `meta` | Can bypass the guard. Keep this list small. |
| `authorizedDiscordUserIds` | operator accounts | Can approve or deny staged requests. |
| OpenClaw runtime config API | trusted write path | Used after validation and approval. |
| config guardian shell script | local safety/blessing authority | Called for safety check and bless. |

## Non-Goals

- It does not sandbox arbitrary shell execution.
- It does not replace OpenClaw's config schema validation.
- It does not guarantee every possible file-write shell command is detected.
- It does not authorize arbitrary users; Discord approval is still scoped to configured user IDs.

## Audit Trail

Events are appended to:

```text
~/.openclaw/runtime/oc-config-gate-audit.jsonl
```

Common actions:

- `apply`
- `apply-stale-base`
- `apply-safety-check-failed`
- `apply-bless-failed`
- `restart-requested`
- `restart-request-failed`

## Operational Guidance

- Keep `allowedAgentIds` to `["meta"]` unless a second manager agent is explicitly trained and trusted.
- Use `restart: true` sparingly. Most config changes should rely on OpenClaw gateway reload behavior.
- Treat failed safety checks as blockers, not warnings.
- If apply fails after writing but before blessing, manually inspect config state before restarting.

