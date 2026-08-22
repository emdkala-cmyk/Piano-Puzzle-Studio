# Preview Run Doc

## Reproduce uncommitted artifacts

No special env files needed — the project has no `.env.local` or `.env` requirements.

Install dependencies:
```bash
npm install
```

## Run the server

The dev server runs Vite (no Electron needed for preview). The main checkout occupies port 5173; use 5175 for this worktree.

```bash
npx vite --host 127.0.0.1 --port 5175
```

Or via Start-Process (Windows detached):
```powershell
powershell -NoProfile -Command "(Start-Process -FilePath 'node_modules\.bin\vite.cmd' -ArgumentList '--host','127.0.0.1','--port','5175' -RedirectStandardOutput '<log>' -RedirectStandardError '<log>.err' -WindowStyle Hidden -PassThru).Id"
```

Vite config lives in `vite.config.ts` with `root: src/renderer` and `strictPort: true`.
