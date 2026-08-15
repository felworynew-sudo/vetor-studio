# Backend publish endpoint (VPS) — spec for the live-site studio

The live site (GitHub Pages) has no server, so studio-mode publishing posts the
edited data to **one endpoint on the VPS backend** (`api.vetor-studio.ru`). The
endpoint writes the data files into a server-side checkout of
`felworynew-sudo/vetor-studio` and pushes to `master` → GitHub Actions redeploys.

This mirrors `persistEditableData` + `publishWithIsomorphicGit` in
`vite.config.js` (the local dev version). The frontend already calls it — see
`src/utils/remotePublish.js` (`POST https://api.vetor-studio.ru/site/publish`,
`Authorization: Bearer <STUDIO_PUBLISH_TOKEN>`).

## Contract

- **Method:** `POST /site/publish`
- **Auth:** header `Authorization: Bearer <STUDIO_PUBLISH_TOKEN>` — compare to an
  env secret; 401 on mismatch (frontend then re-prompts for the key).
- **CORS:** allow origin `https://vetor-studio.ru`, methods `POST, OPTIONS`,
  header `Authorization, Content-Type`. Answer the `OPTIONS` preflight.
- **Body limit:** large — blog images ride inside `blogPosts` as data: URLs.
  Allow ~50 MB JSON.
- **Body keys → files** (write only the keys that are present):
  | payload key | file |
  |---|---|
  | `siteConfig` | `src/data/siteConfig.json` |
  | `tagsConfig` | `src/data/tags.json` |
  | `videoItems` | `src/data/videos.json` |
  | `musicItems` | `src/data/music.json` |
  | `blogPosts` | `src/data/blog.json` **and** `public/data/blog.json` |
  | `galleryItems` | `src/data/gallery.json` |
  | `pricing` | `src/data/pricing.json` |
  | `homeCards` | `src/data/homeCards.json` |
  | `fonts` | `src/data/fonts.json` |
  | `priceCategories` | `src/data/priceCategories.json` |
  | `pageCopy` | `src/data/pageCopy.js` (default export `pageCopy`) |
  | `sectionCopy` | `src/data/sectionCopy.js` (default export `sectionCopy`) |
  | `palette` | `src/data/palette.js` (special module, see vite.config.js) |
- Strip keys starting with `_` (studio-only fields) recursively before writing.
- **Response:** `{ "ok": true, "url": "https://vetor-studio.ru/" }` on success.

## Drop-in handler (Node, system git on the VPS)

Assumes a clone of the repo at `REPO_DIR` with a push remote already
authenticated (deploy key or token in the remote URL). Env:
`STUDIO_PUBLISH_TOKEN`, `REPO_DIR`.

```js
// routes/sitePublish.js  — mount as: app.use('/site', sitePublishRouter)
import express from 'express';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const REPO_DIR = process.env.REPO_DIR; // e.g. /srv/vetor-studio
const TOKEN = process.env.STUDIO_PUBLISH_TOKEN;
const ORIGIN = 'https://vetor-studio.ru';

const strip = (v) => (Array.isArray(v)
  ? v.map(strip)
  : v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith('_')).map(([k, x]) => [k, strip(x)]))
    : v);

const writeJson = (rel, data) =>
  fs.writeFile(path.join(REPO_DIR, rel), `${JSON.stringify(strip(data), null, 2)}\n`, 'utf8');
const writeDefault = (rel, name, data) =>
  fs.writeFile(path.join(REPO_DIR, rel), `const ${name} = ${JSON.stringify(strip(data), null, 2)};\n\nexport default ${name};\n`, 'utf8');

const router = express.Router();
router.use(express.json({ limit: '60mb' }));

router.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', ORIGIN);
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

router.post('/publish', async (req, res) => {
  if ((req.get('authorization') || '') !== `Bearer ${TOKEN}`) {
    return res.status(401).json({ ok: false, message: 'bad token' });
  }
  try {
    const p = req.body || {};
    if (p.siteConfig) await writeJson('src/data/siteConfig.json', p.siteConfig);
    if (p.tagsConfig) await writeJson('src/data/tags.json', p.tagsConfig);
    if (p.videoItems) await writeJson('src/data/videos.json', p.videoItems);
    if (p.musicItems) await writeJson('src/data/music.json', p.musicItems);
    if (p.blogPosts) { await writeJson('src/data/blog.json', p.blogPosts); await writeJson('public/data/blog.json', p.blogPosts); }
    if (p.galleryItems) await writeJson('src/data/gallery.json', p.galleryItems);
    if (p.pricing) await writeJson('src/data/pricing.json', p.pricing);
    if (p.homeCards) await writeJson('src/data/homeCards.json', p.homeCards);
    if (p.fonts) await writeJson('src/data/fonts.json', p.fonts);
    if (p.priceCategories) await writeJson('src/data/priceCategories.json', p.priceCategories);
    if (p.pageCopy) await writeDefault('src/data/pageCopy.js', 'pageCopy', p.pageCopy);
    if (p.sectionCopy) await writeDefault('src/data/sectionCopy.js', 'sectionCopy', p.sectionCopy);
    // palette: see writePaletteFile in vite.config.js if you enable palette editing remotely

    const git = (args) => run('git', args, { cwd: REPO_DIR });
    await git(['add', '-A']);
    const status = await git(['status', '--porcelain']);
    if (status.stdout.trim()) {
      const date = new Date().toISOString().slice(0, 10);
      await git(['commit', '-m', `Update site content ${date}`]);
      await git(['push', 'origin', 'master']);
    }
    res.json({ ok: true, url: `${ORIGIN}/` });
  } catch (e) {
    res.status(500).json({ ok: false, message: String(e && e.message || e) });
  }
});

export default router;
```

## VPS setup checklist

1. `git clone` the repo to `REPO_DIR`; configure a push credential (deploy key
   with write, or a token in the remote URL). Confirm `git push` works manually.
2. Set env `STUDIO_PUBLISH_TOKEN` (a long random string = the studio password)
   and `REPO_DIR`.
3. Mount the router in the bot's Express app; make sure `api.vetor-studio.ru`
   proxies `/site/*` to it (nginx).
4. Give Kirill the `STUDIO_PUBLISH_TOKEN` — that's the key the studio asks for.

Rotate the token by changing the env and restarting; the studio will re-prompt.
