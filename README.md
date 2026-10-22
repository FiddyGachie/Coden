# Coden

Coden is a local proof of concept for reviewing AI-generated code changes. It turns a small project constitution into active rules, checks a pasted change, then returns a SHIP, REVIEW, or BLOCK verdict with evidence and a suggested correction.

## Current implementation

The current POC implements the first part of the product loop described in `IDEA.md` and `SPEC.md`: constitution rules → Gatekeeper check → explainable verdict. It includes direct-database, credential, and payment-route authentication checks. The full Warden roadmap in `TASKS.md` remains a future implementation plan; its unchecked tasks are not represented as completed.

## Development

```powershell
pnpm install
pnpm typecheck
pnpm test
pnpm --filter @coden/dashboard dev
```

See [QUICK_START.md](QUICK_START.md) for the fastest reliable way to run and verify Coden.

Warden does not send telemetry. Demo fixtures are explicitly labelled and are not production findings.
