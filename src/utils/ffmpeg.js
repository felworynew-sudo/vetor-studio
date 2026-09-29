// FFmpeg в браузере (ffmpeg.wasm): обёртка @ffmpeg/ffmpeg (MIT) + однопоточное ядро
// @ffmpeg/core, которое скачивается с jsDelivr по требованию (~30 МБ, затем из кеша).
// Ядро FFmpeg распространяется под GPL и не входит в сборку сайта — грузится как есть.

const CORE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';

let ffPromise = null;
export function loadFFmpeg(onLog) {
  if (ffPromise) return ffPromise;
  ffPromise = (async () => {
    const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import('@ffmpeg/ffmpeg'), import('@ffmpeg/util')]);
    const ff = new FFmpeg();
    if (onLog) ff.on('log', ({ message }) => onLog(message));
    await ff.load({
      coreURL: await toBlobURL(`${CORE}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${CORE}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    return ff;
  })().catch((e) => { ffPromise = null; throw e; });
  return ffPromise;
}

let jobChain = Promise.resolve();
// Последовательная очередь: у ffmpeg.wasm одна файловая система и один процесс.
export function ffmpegRun(file, args, outName, { onProgress } = {}) {
  const job = jobChain.then(async () => {
    const ff = await loadFFmpeg();
    const inName = `in_${Date.now()}_${(file.name || 'input').replace(/[^\w.]+/g, '_')}`;
    const prog = ({ progress }) => onProgress?.(Math.max(0, Math.min(1, progress)));
    ff.on('progress', prog);
    try {
      await ff.writeFile(inName, new Uint8Array(await file.arrayBuffer()));
      const code = await ff.exec(['-hide_banner', '-y', '-i', inName, ...args, outName]);
      if (code !== 0) throw new Error(`ffmpeg exit ${code}`);
      return await ff.readFile(outName);
    } finally {
      ff.off('progress', prog);
      try { await ff.deleteFile(inName); } catch { /* */ }
      try { await ff.deleteFile(outName); } catch { /* */ }
    }
  });
  jobChain = job.catch(() => {});
  return job;
}

// Пресеты кодирования аудио.
export const AUDIO_FORMATS = {
  mp3: { ext: 'mp3', mime: 'audio/mpeg', label: 'MP3', args: (q) => ['-vn', '-c:a', 'libmp3lame', '-b:a', `${q}k`], bitrates: [128, 192, 256, 320] },
  aac: { ext: 'm4a', mime: 'audio/mp4', label: 'AAC (M4A)', args: (q) => ['-vn', '-c:a', 'aac', '-b:a', `${q}k`], bitrates: [96, 128, 192, 256] },
  opus: { ext: 'opus', mime: 'audio/ogg', label: 'Opus', args: (q) => ['-vn', '-c:a', 'libopus', '-b:a', `${q}k`], bitrates: [48, 64, 96, 128, 192] },
  ogg: { ext: 'ogg', mime: 'audio/ogg', label: 'OGG Vorbis', args: (q) => ['-vn', '-c:a', 'libvorbis', '-b:a', `${q}k`], bitrates: [96, 128, 192, 256] },
  flac: { ext: 'flac', mime: 'audio/flac', label: 'FLAC', args: () => ['-vn', '-c:a', 'flac'], bitrates: [] },
  wav: { ext: 'wav', mime: 'audio/wav', label: 'WAV', args: () => ['-vn', '-c:a', 'pcm_s16le'], bitrates: [] },
};
