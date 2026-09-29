// Нейро-шумоподавление RNNoise (Xiph, BSD) в WASM (@shiguredo/rnnoise-wasm, Apache-2.0).
// RNNoise работает на 48 кГц кадрами по 480 сэмплов в масштабе 16-бит PCM:
// ресэмплируем, прогоняем каждый канал, возвращаем буфер 48 кГц. Заодно отдаём
// VAD (вероятность речи) по кадрам — пригодится для удаления тишины.

let rnPromise = null;
function loadRnnoise() {
  if (!rnPromise) rnPromise = import('@shiguredo/rnnoise-wasm').then((m) => m.Rnnoise.load()).catch((e) => { rnPromise = null; throw e; });
  return rnPromise;
}

async function resample(buffer, rate) {
  if (buffer.sampleRate === rate) return buffer;
  const len = Math.ceil((buffer.length * rate) / buffer.sampleRate);
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, len, rate);
  const src = ctx.createBufferSource(); src.buffer = buffer; src.connect(ctx.destination); src.start();
  return ctx.startRendering();
}

// mix — доля обработанного сигнала (0..1): 1 = полная очистка, меньше — мягче.
export async function denoiseBuffer(buffer, { mix = 1, onProgress } = {}) {
  const rn = await loadRnnoise();
  const src = await resample(buffer, 48000);
  const N = rn.frameSize; // 480
  const out = new AudioBuffer({ numberOfChannels: src.numberOfChannels, length: src.length, sampleRate: 48000 });
  const vad = new Float32Array(Math.ceil(src.length / N));
  const frame = new Float32Array(N);
  // У RNNoise задержка ровно один кадр (перекрытие окон): выход сдвигаем назад на N,
  // иначе при mix < 1 сухой и мокрый сигналы дадут гребенчатый фильтр.
  const wet = new Float32Array(src.length + 2 * N);
  for (let c = 0; c < src.numberOfChannels; c += 1) {
    const st = rn.createDenoiseState();
    const inp = src.getChannelData(c); const dst = out.getChannelData(c);
    for (let f = 0, s = 0; s < inp.length + N; f += 1, s += N) {
      frame.fill(0);
      for (let i = 0; i < N && s + i < inp.length; i += 1) frame[i] = inp[s + i] * 32768;
      const v = st.processFrame(frame);
      if (f < vad.length) vad[f] = c === 0 ? v : Math.max(vad[f], v);
      for (let i = 0; i < N; i += 1) wet[s + i] = frame[i] / 32768;
      if (onProgress && f % 500 === 0) onProgress((c + s / inp.length) / src.numberOfChannels);
    }
    for (let j = 0; j < inp.length; j += 1) dst[j] = wet[j + N] * mix + inp[j] * (1 - mix);
    st.destroy();
    // Уступаем поток между каналами, чтобы интерфейс не замирал.
    await new Promise((r) => setTimeout(r, 0)); // eslint-disable-line no-await-in-loop
  }
  return { buffer: out, vad, frameSec: N / 48000 };
}
