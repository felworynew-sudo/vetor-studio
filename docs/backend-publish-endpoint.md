# Live-site publish backend — deployed

The live site (GitHub Pages, static) has no server, so studio-mode publishing
posts the edited data to a small endpoint on the VPS. That endpoint commits the
data files to `felworynew-sudo/vetor-studio` → GitHub Actions redeploys.

**Frontend:** `src/utils/remotePublish.js` — on the live host the studio POSTs
the editable payload to `https://api.vetor-studio.ru/site/publish` with header
`Authorization: Bearer <STUDIO_PUBLISH_TOKEN>` (the "publish key", asked once per
session). On `localhost` it keeps using Vite's `/__publish-cloudflare` middleware.

## Deployed implementation (VPS `103.31.76.29`)

A **standalone, isolated service** — deliberately NOT part of the payment bot
(`vetor-plugin-bot`), so it needs no Docker rebuild of that bot on this small
server, and its failures can't touch payments/plugin-auth.

- `/opt/site-publish/server.py` — pure-stdlib Python 3.9 `http.server`, no deps,
  no repo clone. Commits via the **GitHub Git Data API** (ref → tree → commit →
  update ref: one atomic commit, no local git process — safe on a 964 MB box).
- systemd `site-publish.service` (enabled), listens `127.0.0.1:8095`.
- `/opt/site-publish/site-publish.env` (chmod 600): `GITHUB_TOKEN`,
  `STUDIO_PUBLISH_TOKEN`, `GITHUB_REPO=felworynew-sudo/vetor-studio`.
- Caddy `api.vetor-studio.ru`: `handle /site/* { reverse_proxy 127.0.0.1:8095 }`
  before the default handle (which still proxies the bot on :8080). `/effector/*`
  (→:8081) and the bot (→:8080) are untouched.

### Routes
- `GET /site/health` → `{ "ok": true }`
- `POST /site/publish` — bearer-auth; body is the studio payload; writes the
  data files (see the key→file table below) and commits. → `{ ok, url, commit }`.
  Wrong/missing key → 401 (frontend re-prompts).

### Payload key → file
`siteConfig`→siteConfig.json · `tagsConfig`→tags.json · `videoItems`→videos.json
· `musicItems`→music.json · `blogPosts`→blog.json **and** public/data/blog.json
· `galleryItems`→gallery.json · `pricing`→pricing.json · `homeCards`→homeCards.json
· `fonts`→fonts.json · `priceCategories`→priceCategories.json ·
`pageCopy`/`sectionCopy`→ .js default-export modules. Keys starting with `_` are
stripped. `palette` is not remote-published yet (edit it via local dev studio).

## Operate

```bash
systemctl status site-publish          # health
journalctl -u site-publish -n 50       # logs
systemctl restart site-publish         # after editing the env
```

Rotate the publish key: edit `STUDIO_PUBLISH_TOKEN` in the env file and restart;
the studio will re-prompt on the next publish.
