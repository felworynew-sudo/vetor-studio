// Инспектор C2PA (Content Credentials): достаёт JUMBF-хранилище манифестов из
// JPEG (APP11), PNG (caBX) или WebP (C2PA), разбирает боксы, CBOR-утверждения,
// claim и COSE-подпись (сертификат подписанта). Криптографическая проверка
// подписи и хэшей НЕ выполняется — только чтение того, что записано в файле.

const dec = (b) => { try { return new TextDecoder().decode(b); } catch { return ''; } };

// ---------- CBOR (RFC 8949), минимальный декодер ----------
function cbor(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); let p = 0;
  const len = (ai) => {
    if (ai < 24) return ai;
    if (ai === 24) { const v = bytes[p]; p += 1; return v; }
    if (ai === 25) { const v = dv.getUint16(p); p += 2; return v; }
    if (ai === 26) { const v = dv.getUint32(p); p += 4; return v; }
    if (ai === 27) { const v = Number(dv.getBigUint64(p)); p += 8; return v; }
    return -1; // неопределённая длина
  };
  const item = () => {
    const ib = bytes[p]; p += 1; const mt = ib >> 5; const ai = ib & 31;
    if (mt === 7) {
      if (ai === 20) return false; if (ai === 21) return true; if (ai === 22 || ai === 23) return null;
      if (ai === 25) { const h = dv.getUint16(p); p += 2; const s = h & 0x8000 ? -1 : 1; const e = (h >> 10) & 31; const f = h & 1023; return s * (e ? 2 ** (e - 15) * (1 + f / 1024) : 2 ** -14 * (f / 1024)); }
      if (ai === 26) { const v = dv.getFloat32(p); p += 4; return v; }
      if (ai === 27) { const v = dv.getFloat64(p); p += 8; return v; }
      if (ai === 31) return BREAK;
      return ai < 24 ? ai : len(ai);
    }
    const n = len(ai);
    if (mt === 0) return n;
    if (mt === 1) return -1 - n;
    if (mt === 2 || mt === 3) {
      if (n < 0) { const parts = []; for (;;) { const x = item(); if (x === BREAK) break; parts.push(x); } return mt === 3 ? parts.join('') : parts; }
      const b = bytes.subarray(p, p + n); p += n; return mt === 3 ? dec(b) : b;
    }
    if (mt === 4) { const a = []; if (n < 0) { for (;;) { const x = item(); if (x === BREAK) break; a.push(x); } } else for (let i = 0; i < n; i += 1) a.push(item()); return a; }
    if (mt === 5) {
      const m = {}; const put = () => { const k = item(); if (k === BREAK) return false; m[typeof k === 'object' ? JSON.stringify(k) : k] = item(); return true; };
      if (n < 0) { while (put()); } else for (let i = 0; i < n; i += 1) put(); return m;
    }
    if (mt === 6) return { tag: n, value: item() };
    return undefined;
  };
  return item();
}
const BREAK = Symbol('break');

// ---------- JUMBF (ISO 19566-5) ----------
function boxes(buf, start, end) {
  const out = []; const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength); let p = start;
  while (p + 8 <= end) {
    let size = dv.getUint32(p); const type = dec(buf.subarray(p + 4, p + 8)); let head = 8;
    if (size === 1) { size = Number(dv.getBigUint64(p + 8)); head = 16; } else if (size === 0) size = end - p;
    if (size < head || p + size > end) break;
    out.push({ type, start: p + head, end: p + size }); p += size;
  }
  return out;
}

function superbox(buf, b) {
  const node = { label: '', children: [], content: [] };
  boxes(buf, b.start, b.end).forEach((c, i) => {
    if (i === 0 && c.type === 'jumd') {
      const toggles = buf[c.start + 16];
      if (toggles & 2) { const s = c.start + 17; const z = buf.indexOf(0, s); node.label = dec(buf.subarray(s, z < 0 || z > c.end ? c.end : z)); }
    } else if (c.type === 'jumb') node.children.push(superbox(buf, c));
    else node.content.push({ type: c.type, bytes: buf.subarray(c.start, c.end) });
  });
  return node;
}

// Сырые байты JUMBF из контейнера изображения (или null).
export function extractJumbf(arrayBuffer) {
  const d = new Uint8Array(arrayBuffer);
  if (d[0] === 0xff && d[1] === 0xd8) {
    // APP11: 'JP' CI(2) En(2) Z(4) и дальше бокс; в продолжениях заголовок бокса (8 байт) повторяется
    const parts = new Map(); let p = 2;
    while (p + 4 <= d.length && d[p] === 0xff) {
      const m = d[p + 1]; if (m === 0xda) break; const len = (d[p + 2] << 8) | d[p + 3];
      if (m === 0xeb && d[p + 4] === 0x4a && d[p + 5] === 0x50) {
        const en = (d[p + 6] << 8) | d[p + 7]; const z = new DataView(d.buffer, d.byteOffset + p + 8, 4).getUint32(0);
        const payload = d.subarray(p + 12, p + 2 + len);
        if (!parts.has(en)) parts.set(en, []);
        parts.get(en).push({ z, bytes: parts.get(en).length ? payload.subarray(8) : payload });
      }
      p += 2 + len;
    }
    for (const list of parts.values()) {
      list.sort((a, b) => a.z - b.z);
      const all = new Uint8Array(list.reduce((s, x) => s + x.bytes.length, 0)); let o = 0; list.forEach((x) => { all.set(x.bytes, o); o += x.bytes.length; });
      if (dec(all.subarray(4, 8)) === 'jumb') return all;
    }
    return null;
  }
  if (d[0] === 0x89 && d[1] === 0x50) {
    let p = 8;
    while (p + 8 <= d.length) {
      const len = (d[p] << 24 | d[p + 1] << 16 | d[p + 2] << 8 | d[p + 3]) >>> 0; const type = dec(d.subarray(p + 4, p + 8));
      if (type === 'caBX') return d.subarray(p + 8, p + 8 + len);
      p += 12 + len; if (type === 'IEND') break;
    }
    return null;
  }
  if (dec(d.subarray(0, 4)) === 'RIFF') {
    let p = 12;
    while (p + 8 <= d.length) {
      const size = (d[p + 4] | (d[p + 5] << 8) | (d[p + 6] << 16) | (d[p + 7] << 24)) >>> 0;
      if (dec(d.subarray(p, p + 4)) === 'C2PA') return d.subarray(p + 8, p + 8 + size);
      p += 8 + size + (size & 1);
    }
  }
  return null;
}

// Имя из DER-сертификата: вхождения OID CN (2.5.4.3) и O (2.5.4.10);
// в TBSCertificate сначала идёт issuer, потом subject.
function certNames(der) {
  const find = (oidLast) => {
    const res = [];
    for (let i = 0; i + 7 < der.length; i += 1) {
      if (der[i] === 0x06 && der[i + 1] === 0x03 && der[i + 2] === 0x55 && der[i + 3] === 0x04 && der[i + 4] === oidLast) {
        const tag = der[i + 5]; const l = der[i + 6];
        if ([0x0c, 0x13, 0x16, 0x14].includes(tag) && l < 128) res.push(dec(der.subarray(i + 7, i + 7 + l)));
      }
    }
    return res;
  };
  const cn = find(0x03); const o = find(0x0a);
  return { subject: cn[1] || cn[0] || '', org: o[1] || o[0] || '', issuer: cn.length > 1 ? cn[0] : (o[0] || '') };
}

function parseSignature(bytes) {
  try {
    let s = cbor(bytes); if (s && s.tag === 18) s = s.value; if (!Array.isArray(s)) return null;
    const prot = s[0] && s[0].length ? cbor(s[0]) : {}; const unprot = s[1] || {};
    let chain = prot[33] ?? unprot[33] ?? prot.x5chain ?? unprot.x5chain;
    if (chain instanceof Uint8Array) chain = [chain];
    const alg = { '-7': 'ES256', '-35': 'ES384', '-36': 'ES512', '-37': 'PS256', '-38': 'PS384', '-39': 'PS512', '-8': 'Ed25519' }[String(prot[1])] || String(prot[1] ?? '');
    const cert = Array.isArray(chain) && chain[0] instanceof Uint8Array ? certNames(chain[0]) : null;
    return { alg, ...(cert || {}), chainLength: Array.isArray(chain) ? chain.length : 0, timestamp: !!(unprot.sigTst || unprot.sigTst2) };
  } catch { return null; }
}

const decodeContent = (c) => {
  try { if (c.type === 'cbor') return cbor(c.bytes); if (c.type === 'json') return JSON.parse(dec(c.bytes)); } catch { /* ignore */ }
  return null;
};

const AI_TYPES = /trainedAlgorithmicMedia|compositeWithTrainedAlgorithmicMedia|algorithmicMedia|compositeSynthetic/i;

export function parseC2pa(arrayBuffer) {
  const raw = extractJumbf(arrayBuffer); if (!raw) return null;
  const top = boxes(raw, 0, raw.length).find((b) => b.type === 'jumb'); if (!top) return null;
  const store = superbox(raw, top);
  const manifests = store.children.map((m) => {
    const get = (re) => m.children.find((c) => re.test(c.label));
    const claimBox = get(/^c2pa\.claim/); const claim = claimBox ? decodeContent(claimBox.content[0] || {}) || {} : {};
    const sigBox = get(/^c2pa\.signature/); const signature = sigBox?.content[0] ? parseSignature(sigBox.content[0].bytes) : null;
    const assertionsBox = get(/^c2pa\.assertions/);
    const assertions = (assertionsBox?.children || []).map((a) => ({ label: a.label, data: decodeContent(a.content[0] || {}) }));
    const actions = assertions.filter((a) => /^c2pa\.actions/.test(a.label)).flatMap((a) => a.data?.actions || []).map((x) => ({
      action: x.action, when: x.when || '', digitalSourceType: x.digitalSourceType || '',
      softwareAgent: typeof x.softwareAgent === 'string' ? x.softwareAgent : x.softwareAgent?.name || '',
    }));
    const ingredients = assertions.filter((a) => /^c2pa\.ingredient/.test(a.label)).map((a) => ({ title: a.data?.title || a.data?.['dc:title'] || '', relationship: a.data?.relationship || '' }));
    const gen = claim.claim_generator_info; const genInfo = Array.isArray(gen) ? gen[0] : gen;
    const generator = claim.claim_generator || (genInfo ? `${genInfo.name || ''} ${genInfo.version || ''}`.trim() : '');
    const training = assertions.find((a) => /training-mining/.test(a.label))?.data?.entries || null;
    return { label: m.label, title: claim['dc:title'] || '', format: claim['dc:format'] || '', instanceId: claim.instanceID || '', generator, signature, assertions: assertions.map((a) => a.label), actions, ingredients, training };
  });
  const ai = manifests.some((m) => m.actions.some((a) => AI_TYPES.test(a.digitalSourceType)));
  return { manifests, active: manifests[manifests.length - 1] || null, ai, size: raw.length };
}
