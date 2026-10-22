# Warden

Warden is local mission control for AI coding agents: it turns documented constraints into enforceable rules, records agent evidence, measures behavioral changes, and returns an explainable **SHIP**, **REVIEW**, or **BLOCK** verdict.

## Current implementation

The repository is implementing the P0 demo spine defined in `IDEA.md`, `SPEC.md`, and `TASKS.md`: Constitution Forge, Gatekeeper, Shadow Run, Flight Recorder, Earned Autonomy, Verdict, Mission Control, and reproducible benchmark fixtures.

## Development

```powershell
pnpm install
pnpm typecheck
pnpm test
```

Warden does not send telemetry. Demo fixtures are explicitly labelled and are not production findings.
