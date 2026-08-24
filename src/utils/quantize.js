// Выделение доминирующих РАЗНЫХ цветов из изображения. Наивный «топ по частоте»
// возвращает 6 почти одинаковых оттенков фона; здесь мы строим гистограмму, а
// затем жадно сливаем близкие цвета в кластеры — так в палитру попадают именно
// различимые цвета (акценты вроде жёлтого/телесного не теряются под фоном).

function toHex(r, g, b) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

export function dominantColors(imageData, count = 6, options = {}) {
  const { mergeDist = 46 } = options;
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

  // 2. Жадное слияние близких по цвету бакетов в кластеры.
  const clusters = [];
  for (const bk of buckets) {
    let best = null; let bd = Infinity;
    for (const cl of clusters) {
      const d = Math.sqrt((cl.r - bk.r) ** 2 + (cl.g - bk.g) ** 2 + (cl.b - bk.b) ** 2);
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
  return clusters.slice(0, count).map((c) => ({
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
