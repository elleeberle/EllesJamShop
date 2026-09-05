# Cloudflare Workers cutover

The shop deploys as a [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) project so traffic is served from Cloudflare’s network (DDoS protection included on the free plan). Cloudflare has [moved new investment to Workers](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/) rather than Pages; this repo uses `wrangler deploy`, not `wrangler pages deploy`.

Pull requests still run tests and a production build; only pushes to `main` publish.

Live URL after the first deploy: `https://elles-jam-shop.<your-subdomain>.workers.dev` (confirm the exact subdomain in **Workers & Pages** in the Cloudflare dashboard).

## One-time setup

1. Create a free [Cloudflare account](https://dash.cloudflare.com/sign-up).
2. Enable a `workers.dev` subdomain: **Workers & Pages → Overview → Your workers.dev subdomain**. You do not need to create a Pages project; `wrangler deploy` creates the Worker named `elles-jam-shop`.
3. Create an API token from the **Edit Cloudflare Workers** template ([token docs](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)). That includes **Account → Workers Scripts → Edit**. Do not use a Pages-only token.
4. In this GitHub repo, add Actions secrets:
   - `CLOUDFLARE_API_TOKEN` — the token from step 3
   - `CLOUDFLARE_ACCOUNT_ID` — from the Cloudflare dashboard overview (right sidebar)
5. Push to `main` (or re-run the **Build and Deploy** workflow) and confirm the Worker shows a successful deployment.

If you already created a **Pages** project named `elles-jam-shop` from earlier instructions, delete it after the Worker is live so the name does not collide and you are not serving an extra copy.

## Bot mitigation (dashboard)

These settings are not stored in git.

- **DDoS**: automatic for any Worker on Cloudflare’s network.
- **Bot Fight Mode**: if you later attach a custom domain on a Cloudflare zone, turn **Security → Bots → Bot Fight Mode** **On** for that zone. Leave **Browser Integrity Check** on (default).
- Optional later: a custom WAF rate-limit rule on that zone if the shop URL starts getting hammered.

Order-form spam is still handled by reCAPTCHA v3 and the Formspree honeypot. Cloudflare does not sit in front of Formspree.

## Disable GitHub Pages

After Cloudflare is serving the shop, turn off GitHub Pages so `elleeberle.github.io/EllesJamShop` is not a second, unprotected copy:

1. GitHub repo → **Settings → Pages**
2. Set **Source** to **None** (or disable GitHub Pages)

A custom domain can be attached later in the Worker’s settings if the domain’s nameservers are on Cloudflare.
