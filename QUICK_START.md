# Quick start

Run Coden locally in three commands from the repository root:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @coden/dashboard dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`.

## Try the full flow

1. Keep all three Constitution rules enabled.
2. Select **Load blocked example**. Coden returns **BLOCK** and cites `CDN-001` because the controller calls `db.query`.
3. Select **Load passing example**. Coden returns **SHIP** because the controller uses a repository.
4. Paste `router.post('/payments', createPayment)`. Coden returns **REVIEW** and requests authentication middleware.

## Check the project before changing it

```powershell
pnpm --filter @coden/dashboard typecheck
pnpm --filter @coden/dashboard test
pnpm --filter @coden/dashboard build
```

The browser POC is local-only. It does not send the pasted code anywhere.
