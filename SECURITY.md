# Security Policy

## Supported Versions

Active development happens on `main`. The latest commit on `main` is the supported version until tagged releases are introduced.

## Reporting a Vulnerability

Report vulnerabilities privately through GitHub Security Advisories:

- Security tab -> Advisories -> Report a vulnerability

Do not open public issues for active vulnerabilities involving config bypass, unauthorized approval, secret leakage, or restart bypass.

## Response Targets

| Severity | Acknowledgement | Fix Target |
|----------|----------------|------------|
| Critical / High | 48 hours | 30 days |
| Medium | 5 business days | 90 days |
| Low / Informational | 2 weeks | Best effort |

## In Scope

- `oc_config_stage` and `oc_config_apply` behavior
- Discord approval authorization
- `before_tool_call` guard bypasses
- pending state handling
- stale-base apply behavior
- config safety/blessing calls
- approved safe restart path
- GitHub Actions workflows

## Out of Scope

- Upstream OpenClaw vulnerabilities
- Discord platform outages or permission bugs
- Local operator misuse of `allowedAgentIds`
- Arbitrary shell sandbox escapes outside this plugin's hook policy

## Security Baseline

- No raw secrets in repo.
- CI runs typecheck and tests on Node 22 and 24.
- CodeQL scans TypeScript.
- Dependency review runs on pull requests.
- Dependabot monitors npm and GitHub Actions.

