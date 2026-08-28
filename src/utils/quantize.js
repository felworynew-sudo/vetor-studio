// Выделение доминирующих РАЗНЫХ цветов из изображения. Наивный «топ по частоте»
// возвращает 6 почти одинаковых оттенков фона; здесь мы строим гистограмму, а
// затем жадно сливаем близкие цвета в кластеры — так в палитру попадают именно
// различимые цвета (акценты вроде жёлтого/телесного не теряются под фоном).

function toHex(r, g, b) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

// Перцептивное расстояние цветов (redmean, аппроксимация compuphase). В отличие от
// простого евклида по RGB, отражает то, как разницу видит глаз, — поэтому «оттенки,
// которые на глаз не отличить» получают малое расстояние и корректно сливаются, а не
// оседают в палитре почти-дублями. Возвращает НЕквадратичное расстояние (~0..765).
function redmean(r1, g1, b1, r2, g2, b2) {
  const rm = (r1 + r2) * 0.5;
  const dr = r1 - r2; const dg = g1 - g2; const db = b1 - b2;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

export function dominantColors(imageData, count = 6, options = {}) {
  // mergeDist — порог слияния бакетов в кластеры; distinctDist — гарантия, что
  // ИТОГОВЫЕ цвета палитры взаимно различимы (не показываем почти-дубли). Оба в
  // redmean-единицах (перцептивные, ~2.5× крупнее прежнего евклида 46).
  const { mergeDist = 100, distinctDist = 80 } = options;
  const { data } = imageData;

  // 1. Гистограмма 5 бит/канал (32³ ячейки), копим сумму для точного среднего.
  const hist = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 125) continue;
    const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const e = hist.get(key);
    if (e) { e.r += r; e.g += g; e.b += b; e.n += 1; } else hist.set(key, { r, g, b, n: 1 });
  }
  const buckets = [...hist.values()]
    .map((e) => ({ r: e.r / e.n, g: e.g / e.n, b: e.b / e.n, n: e.n }))
    .sort((a, b) => b.n - a.n);

  // 2. Жадное слияние перцептивно-близких бакетов в кластеры (redmean).
  const clusters = [];
  for (const bk of buckets) {
    let best = null; let bd = Infinity;
    for (const cl of clusters) {
      const d = redmean(cl.r, cl.g, cl.b, bk.r, bk.g, bk.b);
      if (d < bd) { bd = d; best = cl; }
    }
    if (best && bd < mergeDist) {
      const tot = best.n + bk.n;
      best.r = (best.r * best.n + bk.r * bk.n) / tot;
      best.g = (best.g * best.n + bk.g * bk.n) / tot;
      best.b = (best.b * best.n + bk.b * bk.n) / tot;
      best.n = tot;
    } else {
      clusters.push({ ...bk });
    }
  }

  clusters.sort((a, b) => b.n - a.n);
  const total = clusters.reduce((s, c) => s + c.n, 0) || 1;

  // 3. Гарантия различимости: берём самые массовые кластеры, но пропускаем тот, что
  // перцептивно неотличим от уже выбранного — так в палитре нет почти-дублей.
  const picked = [];
  for (const c of clusters) {
    if (picked.every((p) => redmean(p.r, p.g, p.b, c.r, c.g, c.b) >= distinctDist)) picked.push(c);
    if (picked.length >= count) break;
  }
  return picked.map((c) => ({
    hex: toHex(c.r, c.g, c.b),
    pct: Math.round((c.n / total) * 100),
    weight: c.n,
  }));
}

// Готовит ImageData из изображения с даунскейлом (для скорости).
export function imageToData(img, maxDim = 200) {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
