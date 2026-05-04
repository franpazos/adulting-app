# Deployment

Adulting.app deploys as a static PWA to **Vercel** (free tier, custom domain optional). The repo includes a `vercel.json` with the headers and rewrites the app needs.

## What `vercel.json` does

### COOP / COEP — required for SQLite-OPFS

```jsonc
{ "key": "Cross-Origin-Opener-Policy",   "value": "same-origin" }
{ "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
```

`@sqlite.org/sqlite-wasm` uses the **Origin Private File System** for durable storage. OPFS sync access handles only work when the page is **cross-origin isolated**, and that requires both of these headers. Without them the app silently falls back to an in-memory DB and your data is lost on every reload — see ADR-008.

> **Phase 9 caveat:** Google OAuth uses a popup. With `COOP=same-origin` the popup loses access to `window.opener`, which can break the OAuth callback. When Phase 9 lands, switch to OAuth via redirect (no popup) or relax COOP to `same-origin-allow-popups` if needed.

### Service worker cache rules

- `/sw.js` and `/workbox-*.js` → `Cache-Control: public, max-age=0, must-revalidate` so update prompts surface promptly.
- `/index.html` → same. The HTML references hashed asset names, so as long as it's fresh, the user always pulls the right bundles.
- `/assets/*` and `/fonts/*` → `Cache-Control: public, max-age=31536000, immutable`. Vite emits hashed filenames; immutable is safe.

### SPA rewrite

```jsonc
{ "source": "/(.*)", "destination": "/index.html" }
```

Vercel checks for a real file before applying rewrites, so `/assets/foo.js` is served as-is and only client-only paths like `/transactions/abc123` fall through to `index.html`. React Router takes it from there.

---

## First-time deploy (CLI)

You only need to do this once.

```bash
cd /Users/fran/Documents/fran/adulting-app
pnpm dlx vercel
```

Vercel prompts:
- **Set up and deploy?** Yes.
- **Which scope?** Your personal account.
- **Link to existing project?** No.
- **Project name:** `adulting-app` (default works).
- **Directory:** `./` (default).
- **Framework preset:** Vite is auto-detected (matches `vercel.json`).

After ~30s you get two URLs: a **Preview** URL (per-deploy) and a **Production** URL once you promote it.

To promote a preview to production:

```bash
pnpm dlx vercel --prod
```

## Continuous deploy via GitHub (recommended)

Go to https://vercel.com/new → Import the `franpazos/adulting-app` GitHub repo → Vercel reads `vercel.json` and auto-deploys on every `git push` to `main`.

Optional: add a custom domain in the Vercel dashboard. The app is served at `https://adulting-app.vercel.app` by default.

## Verifying the deploy

After deploy, run these in any browser:

```bash
# Headers
curl -I https://your-deploy.vercel.app/ | grep -iE 'cross-origin|cache-control'

# SW served
curl -I https://your-deploy.vercel.app/sw.js | head -5

# Manifest served
curl -I https://your-deploy.vercel.app/manifest.webmanifest | head -5
```

Expected response on `/`:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cache-Control: public, max-age=0, must-revalidate
```

In Chrome DevTools → Application → Service Workers, you should see `sw.js` activated. In Application → Storage → Origin Private File System, you should see the `adulting.sqlite3` database after first use.

## Installing on iPhone

1. Open the deployed URL in **Safari iOS** (not Chrome — iOS Chrome can't install PWAs).
2. Tap the **Share** button.
3. Scroll → **Add to Home Screen**.
4. Confirm; the violet coin icon lands on your home screen.
5. Open from there and you'll get the fullscreen experience without Safari chrome.

The in-app `InstallPrompt` banner detects iOS Safari and shows this same instruction inline.

## Installing on macOS / Android

- **Chrome / Edge desktop:** address bar shows an install icon, or the in-app `InstallPrompt` banner has an Install button.
- **Android Chrome:** the banner triggers the native prompt directly.

## Troubleshooting

**OPFS not persisting → `in-memory` pill in Settings.**
Confirm the COOP / COEP headers really land on the response. Some hosts strip security headers; on Vercel they should pass through `vercel.json` directly. Use the `curl -I` check above.

**`sw.js` 404.**
Run `pnpm build` locally to confirm `dist/sw.js` exists. If it does but Vercel returns 404, the framework preset may have routed it incorrectly — make sure `outputDirectory` is `dist`.

**iOS Safari refuses install.**
Apple requires HTTPS + a valid manifest. Vercel gives you HTTPS for free; the manifest is at `/manifest.webmanifest`. If install still fails, check Safari → Develop menu → Web Inspector → Console for manifest validation errors.

**Stale version after deploy.**
The `UpdatePrompt` banner appears next time the user opens the app and the SW notices a new version. Tap "Refresh" → reload. If users complain about stuck old versions, they can hard-refresh once (`Cmd+Shift+R`) or clear the SW from DevTools.
