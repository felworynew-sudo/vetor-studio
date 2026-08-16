// Remote publishing for studio mode.
//
// On the local dev server the studio talks to Vite's own /__save-local and
// /__publish-cloudflare middleware (see vite.config.js). On the LIVE site
// (GitHub Pages — no server) there is no such middleware, so the studio instead
// posts the same payload to a small endpoint on the VPS backend, which writes
// the data files into a checkout of this repo and pushes to master → Actions
// redeploys. That endpoint is gated by a bearer token (the studio password),
// so a random visitor who appends ?studio=1 can edit their own localStorage but
// cannot publish.

// Override with window.__VETOR_PUBLISH_ENDPOINT for testing/staging.
export const REMOTE_PUBLISH_ENDPOINT = (typeof window !== 'undefined' && window.__VETOR_PUBLISH_ENDPOINT)
  || 'https://api.vetor-studio.ru/site/publish';

const TOKEN_KEY = 'studio-publish-token';

export function isLocalStudioHost() {
  if (typeof window === 'undefined') return false;
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
}

export function getStudioPublishToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setStudioPublishToken(token) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // sessionStorage unavailable — token just won't persist for the session
  }
}

export function promptStudioPublishToken() {
  const existing = getStudioPublishToken();
  const value = (window.prompt('Ключ студии (публикация):', existing || '') || '').trim();
  setStudioPublishToken(value);
  return value;
}

// Ask the backend whether a key is valid (used to unlock the studio UI on the
// live site). On localhost there is no backend — the dev server is trusted.
export async function verifyStudioKey(token) {
  if (isLocalStudioHost()) return true;
  if (!token) return false;
  try {
    const url = REMOTE_PUBLISH_ENDPOINT.replace(/\/publish$/, '/verify');
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    return res.ok;
  } catch {
    return false;
  }
}

// Resolve where a save/publish request should go and with what headers.
// kind: 'save' (write files, no deploy) | 'publish' (write + push → deploy).
// Returns { url, headers, remote, missingToken }.
export function resolvePublishTarget(kind) {
  if (isLocalStudioHost()) {
    return {
      url: kind === 'save' ? '/__save-local' : '/__publish-cloudflare',
      headers: { 'Content-Type': 'application/json' },
      remote: false,
      missingToken: false,
    };
  }

  const token = getStudioPublishToken() || promptStudioPublishToken();
  if (!token) {
    return { url: '', headers: {}, remote: true, missingToken: true };
  }

  return {
    url: REMOTE_PUBLISH_ENDPOINT,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    remote: true,
    missingToken: false,
  };
}
