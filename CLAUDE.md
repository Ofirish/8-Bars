# 8 Bars (Eight Bars) — project notes for Claude

Game: `src/components/EightBars.tsx` + `src/game/` (client-only; no server/auth needed).

## Deploy / update path (CI/CD)
- Live site: https://ofirish.github.io/8-Bars/
- Every push/merge to `main` triggers `.github/workflows/deploy.yml`, which type-checks,
  builds a static SPA (`PAGES_BASE=/8-Bars/`, see `vite.config.ts`) and deploys to GitHub Pages.
- To update the game: edit code, push to `main` (or open a PR and merge it). Nothing else to do.
- Static build output is `dist/client`; `scripts/pages-postbuild.mjs` creates index.html/404.html.
- Use `import.meta.env.BASE_URL` for any asset URL (site lives under `/8-Bars/`, not `/`).
- Build locally: `PAGES_BASE=/8-Bars/ VITE_AUTH_ENABLED=false npx vite build && node scripts/pages-postbuild.mjs`
- Dev: `npm run dev` (port 8080). Vercel-style build (`npm run build`) is the original, unused for Pages.
- Keep `npx tsc --noEmit` passing; the workflow fails otherwise.
