# Deploying Maven

Maven is a long-running Node server. It streams chat replies and stores workspaces in files under `MAVEN_DATA_DIR`, so it needs:

- **A host that runs a server process.** Static hosts such as GitHub Pages or Netlify static won't work. Serverless functions such as Vercel don't fit either, because of the long streaming requests and the local disk.
- **A persistent volume** mounted at `/data`. Without one, every workspace is lost on redeploy.
- **A single instance** until storage moves to Postgres (see `architecture.md`).

The repo includes a `Dockerfile`, so any Docker host works.

## Environment variables

| Variable | Required | Value |
|---|---|---|
| `PUBLIC_URL` | yes | The public URL, e.g. `https://maven.example.com`. Used in embed snippets. |
| `MAVEN_SECRET` | yes | A long random string (`openssl rand -hex 32`). Encrypts tenants' AI keys. **If you lose or change it, saved keys can't be decrypted.** |
| `MAVEN_ACCESS_PASSWORD` | strongly recommended | Password-protects onboarding and the dashboard (the browser asks for it; any username works). The widget, test pages and `/healthz` stay public. Without it, anyone who finds the URL can create workspaces. |
| `NODE_ENV` | set by the Dockerfile | `production`. This also blocks crawling or calling private-network URLs. |
| `PORT` | no | Defaults to 3000. Most platforms set it for you. |

## Option A: Railway (easiest)

1. Go to https://railway.com → **New Project → Deploy from GitHub repo** and pick this repo. It builds from the `Dockerfile` automatically.
2. Open the service → **Settings → Volumes → Add volume**, with mount path `/data`.
3. **Variables:** add `MAVEN_SECRET`, `MAVEN_ACCESS_PASSWORD` and `PUBLIC_URL`. For `PUBLIC_URL`, generate a domain under **Settings → Networking** first (e.g. `https://maven-production.up.railway.app`), or add your own domain there.
4. Deploy. You can set the health check path to `/healthz`.

## Option B: Fly.io

```bash
fly launch --no-deploy            # detects the Dockerfile; choose a name and region
fly volumes create maven_data --size 1
```

Add to the generated `fly.toml`:

```toml
[mounts]
  source = "maven_data"
  destination = "/data"

[http_service]
  internal_port = 3000
  auto_stop_machines = "off"      # keep the server up so the widget answers instantly
  min_machines_running = 1
```

```bash
fly secrets set MAVEN_SECRET=$(openssl rand -hex 32) MAVEN_ACCESS_PASSWORD=choose-one PUBLIC_URL=https://<app>.fly.dev
fly deploy
```

## Option C: Render

**New → Web Service** → connect the repo (runtime: Docker). Add a **Disk** mounted at `/data` (disks need a paid instance type), set the environment variables above, and set the health check path to `/healthz`.

## Option D: any VPS (DigitalOcean, Hetzner, Lightsail...)

```bash
docker build -t maven .
docker run -d --name maven --restart unless-stopped -p 3000:3000 -v maven_data:/data \
  -e PUBLIC_URL=https://maven.example.com \
  -e MAVEN_SECRET=... -e MAVEN_ACCESS_PASSWORD=... maven
```

Put Caddy or nginx in front for HTTPS (Caddy: `maven.example.com { reverse_proxy localhost:3000 }`). Turn off response buffering on the proxy so replies stream. Caddy streams by default. For nginx, the server already sends `X-Accel-Buffering: no`.

## After deploying

1. Open `PUBLIC_URL`, enter the password, and create a workspace.
2. Copy the snippet from **Install** into your website. The widget loads `widget.js` from your Maven URL, so HTTPS is required when your site is HTTPS.
3. Back up the volume (`/data`) and keep `MAVEN_SECRET` somewhere safe. Together they are the whole database.
