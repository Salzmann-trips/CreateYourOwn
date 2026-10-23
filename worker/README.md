# Planning server (step 2)

`worker.js` is the whole server in one file. It receives the wizard answers, asks Claude for the plan (with a few web searches to check facts), checks the plan, looks up hidden gems on OpenStreetMap and streams the result to the website. It also does the robot check and the daily limits.

Don't edit `worker.js` by hand: it's generated from `../plan.js` plus the server code, so the website and the server always use the same questions and checks.

## Setup (Cloudflare dashboard, no coding)
1. **Anthropic:** at console.anthropic.com create an API key and set a monthly spending limit (Settings → Limits).
2. **Cloudflare:** create a free account. Workers & Pages → Create → Worker → name it `cyo-planner` → Deploy. Then Edit code, replace everything with the contents of `worker.js`, Deploy.
3. **Daily counters:** Storage & Databases → KV → Create namespace `cyo-limits`. In the Worker: Settings → Bindings → Add → KV namespace, variable name `LIMITS`, pick `cyo-limits`.
4. **Robot check:** Turnstile → Add widget, domain `salzmann-trips.github.io`, mode Managed. Keep the site key and the secret key.
5. **Variables** (Worker → Settings → Variables and secrets):
   - Secret `ANTHROPIC_API_KEY` = your API key
   - Secret `TURNSTILE_SECRET` = the Turnstile secret key
   - `ALLOWED_ORIGINS` = `https://salzmann-trips.github.io`
   - `MODEL` = a current Claude model id from docs.claude.com (models overview)
   - `PER_IP_DAY` = `3`, `PER_DAY` = `40`, `WEB_SEARCHES` = `4`, `VERIFY_GEMS` = `1`, `CONTACT` = your email
6. **Web search** must be enabled for your organisation in the Anthropic console (it is billed per search).
7. **Website:** in `app.js`, set `apiUrl` to the Worker address (e.g. `https://cyo-planner.<your-name>.workers.dev`) and `turnstileSiteKey` to the Turnstile site key. Upload `app.js` again.

Check: open the Worker address with `/health` at the end; it should show `{"ok":true}`.
