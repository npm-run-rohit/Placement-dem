# Hosted QA demo (Vercel + Render + Neon)

A shareable demo for QA and product review. **Dev auth and dev simulators are on** (everyone is Himani Doshi,
Placement Head) and the data is the demo fixtures, so the whole site sits behind one shared login. Not production:
production is `infra/cdk`.

| Piece | Where | What |
| --- | --- | --- |
| Web app | Vercel (`vercel.json`, `middleware.js`) | Static build with `NEXT_PUBLIC_DEV_TOOLS=true`; `/api` and `/mailpit` rewrite to Render; basic auth |
| API + worker + Redis + Mailpit | Render free web service (`render.yaml`, `infra/demo/Dockerfile`) | One container, Caddy in front (basic auth, `/mailpit` to Mailpit, rest to the API) |
| Postgres | Neon free | Wiped and reloaded (migrations, PRD seed, fixtures) on every start, i.e. each wake from sleep; "Reset demo data" in the dev tools menu does the same on demand |

Render's free tier sleeps after 15 minutes idle. The first request then takes about a minute, and Mailpit mail,
uploaded files and queued jobs from before the sleep are gone (the database stays).

## Set up

1. **Neon**: create a project in AWS Asia Pacific (Singapore). Copy the direct connection string (not the
   `-pooler` host), ending `?sslmode=require`.
2. **Render**: New > Blueprint, pick this repo, branch `main`. Fill `DATABASE_URL` (Neon),
   `DEMO_PASS_HASH` (`docker run --rm caddy:2.8.4-alpine caddy hash-password --plaintext '<password>'`) and
   `APP_BASE_URL` (the Vercel URL, can be filled after step 3). If Render's URL is not
   `https://placement-demo-mnvk.onrender.com`, change the three Render URLs in `vercel.json`.
3. **Vercel**: import this repo, root directory `/` of the repo (where `vercel.json` is), framework Other.
   Add the environment variable `DEMO_BASIC` = base64 of `qa:<password>`. Deploy.
4. Open the Vercel URL, log in with `qa` and the password. Mailpit is at `<vercel url>/mailpit/` (same login).

## Run the container locally

```bash
docker build -f infra/demo/Dockerfile -t placement-demo .
docker run -m 512m -p 10000:10000 -e PORT=10000 -e DATABASE_URL=postgres://... \
  -e DEMO_USER=qa -e DEMO_PASS_HASH='<bcrypt>' -e SMTP_HOST=127.0.0.1 -e REDIS_URL=redis://127.0.0.1:6379 placement-demo
```
