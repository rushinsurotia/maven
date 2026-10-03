# Deploying Maven

Maven is a long-running Node server that streams chat replies. Deploy it anywhere that runs a server process or a Docker image. Static hosts (GitHub Pages) and serverless functions (Vercel) won't work.

It needs somewhere to keep its data. Pick one:

- **Postgres (recommended, no volume needed):** set `DATABASE_URL`. Maven creates its tables on startup.
- **Files on a persistent volume:** leave `DATABASE_URL` unset and mount a volume at `/data`. Without either, every workspace is lost on each redeploy.

Run **a single instance** for now. Each server keeps a copy of the data in memory (see `architecture.md` for the multi-instance design).

## Environment variables

| Variable | Required | Value |
|---|---|---|
| `DATABASE_URL` | yes, unless you use a volume | Postgres connection string, e.g. `postgres://user:pass@host:5432/db`. For hosted databases that need SSL (Neon, Supabase), keep the `?sslmode=require` they include. |
| `MAVEN_SECRET` | yes | A long random string (`openssl rand -hex 32`). Encrypts tenants' AI keys. The server refuses to start without it in production. **If you lose or change it, saved keys can't be decrypted.** |
| `MAVEN_ACCESS_PASSWORD` | strongly recommended | Password-protects onboarding and the dashboard (the browser asks for it; any username works). The widget, test pages and `/healthz` stay public. Without it, anyone who finds the URL can create workspaces. |
| `PUBLIC_URL` | yes | The public URL, e.g. `https://maven.example.com`. Used in embed snippets. |
| `NODE_ENV` | set by the Dockerfile | `production`. This also blocks crawling or calling private-network URLs. |
| `PORT` | no | Defaults to 3000. Most platforms set it for you. |

### Included AI (optional): your Groq or Claude keys

Set these and onboarding offers **Maven AI (included)** first, so businesses can start without their own key. They can still connect their own key at any time.

| Variable | Value |
|---|---|
| `MAVEN_GROQ_API_KEY` | Your Groq key (`gsk_...`, from console.groq.com → API Keys). |
| `MAVEN_GROQ_MODEL` | Optional. Default `auto` picks the best chat model your key can use. |
| `MAVEN_ANTHROPIC_API_KEY` | Optional. Your Anthropic key. If you set both, the second backend takes over when the first fails. |
| `MAVEN_ANTHROPIC_MODEL` | Optional. Default `claude-opus-5`. `claude-sonnet-5` and `claude-haiku-4-5` cost less. |
| `MAVEN_MANAGED_PROVIDER` | Optional. Which backend to try first when both are set: `groq` (default) or `anthropic`. |
| `MAVEN_MANAGED_DAILY_MESSAGES` | Optional. Included messages per workspace per day (default `200`). This caps your bill. |

`GET /healthz` returns e.g. `{"ok":true,"storage":"postgres","includedAI":["groq"]}`, so you can confirm the storage and included-AI setup.

## Option A: Railway (easiest)

1. Go to https://railway.com → **New Project → Deploy from GitHub repo** and pick this repo. It builds from the `Dockerfile` automatically. If your code isn't on the default branch, choose the branch under the service's **Settings → Source**.
2. In the same project: **+ Create → Database → PostgreSQL**.
3. Open the Maven service → **Variables**:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (Railway fills in the reference)
   - `MAVEN_SECRET` = output of `openssl rand -hex 32`
   - `MAVEN_ACCESS_PASSWORD` = a password of your choice
   - `PUBLIC_URL` = the domain from **Settings → Networking → Generate Domain**, e.g. `https://maven-production.up.railway.app`
4. Deploy. The logs should show `storage: postgres`. You can set the health check path to `/healthz`.

## Using a free hosted Postgres instead

If your host has no database add-on, create a free Postgres at [Neon](https://neon.tech) or [Supabase](https://supabase.com), copy its connection string into `DATABASE_URL`, and deploy the app anywhere below. Check each provider's current free-tier limits.

## Option B: Fly.io

```bash
fly launch --no-deploy            # detects the Dockerfile; choose a name and region
```

Use Postgres (`DATABASE_URL` from Neon, Supabase or Fly's Postgres offering), or create a volume with `fly volumes create maven_data --size 1` and add a `[mounts]` section (`source = "maven_data"`, `destination = "/data"`). Then add to `fly.toml`:

```toml
[http_service]
  internal_port = 3000
  auto_stop_machines = "off"      # keep the server up so the widget answers instantly
  min_machines_running = 1
```

```bash
fly secrets set DATABASE_URL='postgres://...' MAVEN_SECRET=$(openssl rand -hex 32) MAVEN_ACCESS_PASSWORD=choose-one PUBLIC_URL=https://<app>.fly.dev
fly deploy
```

## Option C: Render

**New → Web Service** → connect the repo (runtime: Docker). For storage, create a Render Postgres (or use Neon/Supabase) and set `DATABASE_URL` to its connection string. You don't need a Disk. Set the other environment variables above and the health check path to `/healthz`. Free web services sleep when idle, so the widget's first reply after a quiet period can be slow.

## Option D: any VPS (DigitalOcean, Hetzner, Lightsail...)

```bash
docker build -t maven .
docker run -d --name maven --restart unless-stopped -p 3000:3000 -v maven_data:/data \
  -e DATABASE_URL=...    `# optional: use Postgres instead of the volume` \
  -e PUBLIC_URL=https://maven.example.com \
  -e MAVEN_SECRET=... -e MAVEN_ACCESS_PASSWORD=... maven
```

Put Caddy or nginx in front for HTTPS (Caddy: `maven.example.com { reverse_proxy localhost:3000 }`). Turn off response buffering on the proxy so replies stream. Caddy streams by default. For nginx, the server already sends `X-Accel-Buffering: no`.

## After deploying

1. Open `PUBLIC_URL`, enter the password, and create a workspace.
2. Copy the snippet from **Install** into your website. The widget loads `widget.js` from your Maven URL, so HTTPS is required when your site is HTTPS.
3. Back up the database (or the `/data` volume) and keep `MAVEN_SECRET` somewhere safe. You need both to restore.
