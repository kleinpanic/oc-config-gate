# oc-config-gate Wiki

`oc-config-gate` is the approved OpenClaw config control plane for agent-proposed configuration changes.

Use this wiki mirror when GitHub's separate wiki repository is unavailable or has not initialized yet. The content is kept in the main repo so it is protected by CI, branch protection, and code owner review.

## Start Here

- [Operator Runbook](Operator-Runbook.md)
- [Approval Flow](Approval-Flow.md)
- [Security Model](Security-Model.md)
- [Old oc-restart Migration](Old-oc-restart-Migration.md)

## Runtime Contract

- Agents stage RFC 7396 merge patches through `oc_config_stage`.
- Discord operator approval is required before writes.
- Approval revalidates, safety-checks, writes, blesses, and audits.
- Raw restart paths are blocked for non-meta agents.
