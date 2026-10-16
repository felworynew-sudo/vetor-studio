"""Apollo на официальном примере: codec -> restored, сравнение с оригиналом."""
import sys
import wave

sys.path.insert(0, r"D:\apollo-x\pylib")

import numpy as np
import onnxruntime as ort


def read_wav(path):
    with open(path, "rb") as f:
        data = f.read()
    ch = int.from_bytes(data[22:24], "little")
    sr = int.from_bytes(data[24:28], "little")
    bits = int.from_bytes(data[34:36], "little")
    pos = 12
    while pos < len(data):
        cid = data[pos:pos + 4]
        size = int.from_bytes(data[pos + 4:pos + 8], "little")
        if cid == b"data":
            raw = data[pos + 8:pos + 8 + size]
            break
        pos += 8 + size
    arr = np.frombuffer(raw, dtype=np.float32 if bits == 32 else np.int16).astype(np.float32)
    if bits == 16:
        arr /= 32768
    return arr.reshape(-1, ch).T.copy(), sr


def band_db(x, sr, lo, hi):
    spec = np.abs(np.fft.rfft(x.mean(0))) ** 2
    f = np.fft.rfftfreq(x.shape[1], 1 / sr)
    return 10 * np.log10(spec[(f >= lo) & (f < hi)].sum() + 1e-20)


def snr(ref, est):
    n = min(ref.shape[1], est.shape[1])
    ref, est = ref[:, :n], est[:, :n]
    return 10 * np.log10(np.sum(ref ** 2) / np.sum((est - ref) ** 2))


def lsd(ref, est, sr, lo):
    # log-spectral distance по кадрам выше lo Гц (стандартная метрика bandwidth-extension)
    n = min(ref.shape[1], est.shape[1]); N = 2048; hop = 512
    win = np.hanning(N); out = []
    f = np.fft.rfftfreq(N, 1 / sr); m = f >= lo
    for s in range(0, n - N, hop):
        a = np.abs(np.fft.rfft(ref.mean(0)[s:s + N] * win)) ** 2 + 1e-10
        b = np.abs(np.fft.rfft(est.mean(0)[s:s + N] * win)) ** 2 + 1e-10
        out.append(np.sqrt(np.mean((10 * np.log10(a[m] / b[m])) ** 2)))
    return float(np.mean(out))


codec, sr = read_wav(r"D:\apollo-x\samples\codec_wav.wav")
ori, _ = read_wav(r"D:\apollo-x\samples\ori_wav.wav")
print(f"sr {sr}, {codec.shape[1] / sr:.1f} s, ch {codec.shape[0]}")
for name in ("fp32", "fp16"):
    sess = ort.InferenceSession(rf"D:\apollo-x\apollo-44k-{name}.onnx", providers=["CPUExecutionProvider"])
    est = sess.run(None, {"audio": codec})[0]
    print(f"[{name}] SNR к оригиналу: кодек {snr(ori, codec):.2f} дБ -> Apollo {snr(ori, est):.2f} дБ; "
          f"LSD выше 4 кГц: кодек {lsd(ori, codec, sr, 4000):.2f} -> Apollo {lsd(ori, est, sr, 4000):.2f}")
    for lo, hi in ((4000, 8000), (8000, 12000), (12000, 16000), (16000, 20000)):
        print(f"   {lo // 1000}-{hi // 1000} кГц: оригинал {band_db(ori, sr, lo, hi):.1f}, кодек {band_db(codec, sr, lo, hi):.1f}, Apollo {band_db(est, sr, lo, hi):.1f} дБ")
    if name == "fp16":
        np.save(r"D:\apollo-x\samples\apollo_out.npy", est)
