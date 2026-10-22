# Coden

Coden is a local proof of concept for reviewing AI-generated code changes. Paste a controller change and it checks one architectural boundary: controllers must not issue direct database queries.

## Current implementation

The current POC provides one complete flow: paste code → scan → receive a pass/block decision with evidence and a recommended correction. The wider product ideas in the repository documents are reference material for later iterations.

## Development

```powershell
pnpm install
pnpm typecheck
pnpm test
pnpm --filter @coden/dashboard dev
```

Warden does not send telemetry. Demo fixtures are explicitly labelled and are not production findings.
