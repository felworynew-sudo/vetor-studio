"""Apollo (JusperLee/Apollo, CC-BY-SA-4.0) -> ONNX for in-browser inference.

STFT/iSTFT are expressed as Conv1d / ConvTranspose1d with fixed DFT kernels so the
graph has no complex tensors and runs fully on the WebGPU execution provider.
The wrapper is checked against the original torch model before export.
"""
import math
import sys

sys.path.insert(0, r"D:\apollo-x\pylib")
sys.path.insert(0, r"D:\apollo-x\raw")
sys.path.insert(0, r"D:\apollo-x\stubs")

import torch
import torch.nn as nn
import torch.nn.functional as F

from look2hear.models.apollo import Apollo

import os

DRY = os.environ.get("APOLLO_DRY") == "1"  # пробный прогон на случайных весах
cfg = dict(sr=44100, win=20, feature_dim=256, layer=6)
if DRY:
    torch.manual_seed(0)
    model = Apollo(**cfg)
    print("DRY RUN: random weights")
else:
    ckpt = torch.load(r"D:\apollo-x\pytorch_model.bin", map_location="cpu", weights_only=False)
    state = ckpt["state_dict"] if isinstance(ckpt, dict) and "state_dict" in ckpt else ckpt
    margs = ckpt.get("model_args", {}) if isinstance(ckpt, dict) else {}
    print("model_args:", {k: v for k, v in margs.items() if not hasattr(v, "shape")})
    cfg.update({k: margs[k] for k in cfg if k in margs})
    model = Apollo(**cfg)
    missing, unexpected = model.load_state_dict(state, strict=False)
    print("missing", len(missing), "unexpected", len(unexpected))
    assert not missing and not unexpected
model.eval()


from look2hear.models.apollo import Roformer


def _roformer_forward(self, input):
    # то же, что оригинал, но .mT → transpose(-1, -2): legacy ONNX-экспортёр не знает aten::mT
    B, _, T = input.shape
    weight = self.weight(self.input_drop(self.input_norm(input))).reshape(B, self.num_head, self.hidden_size * 3, T).transpose(-1, -2)
    Q, K, V = torch.split(weight, self.hidden_size, dim=-1)
    Q_rot = self._add_rotary_sequence(Q)
    K_rot = self._add_rotary_sequence(K)
    attention_output = F.scaled_dot_product_attention(Q_rot.contiguous(), K_rot.contiguous(), V.contiguous(), dropout_p=self.attention_drop, is_causal=self.causal)
    attention_output = attention_output.transpose(-1, -2).reshape(B, -1, T)
    output = self.output(attention_output) + input
    gate, z = self.MLP(output).chunk(2, dim=1)
    output = output + self.MLP_output(F.silu(gate) * z)
    return output, (K_rot, V)


Roformer.forward = _roformer_forward

from look2hear.models.apollo import RMSNorm


def _rmsnorm_forward(self, input):
    # то же, что оригинал, без .float()/.type_as (в fp32 это no-op, а в графе дают
    # Cast-узлы, на которых ломается конвертация в fp16)
    B, N, T = input.shape
    x = input.reshape(B, self.groups, -1, T)
    x = x * torch.rsqrt(x.pow(2).mean(-2, keepdim=True) + self.eps)
    return x.reshape(B, N, T) * self.weight.reshape(1, -1, 1)


RMSNorm.forward = _rmsnorm_forward


class ApolloStft(nn.Module):
    def __init__(self, m):
        super().__init__()
        self.m = m
        n_fft, hop = m.win, m.stride
        bins = n_fft // 2 + 1
        self.n_fft, self.hop, self.bins = n_fft, hop, bins
        n = torch.arange(n_fft, dtype=torch.float64)
        k = torch.arange(bins, dtype=torch.float64).unsqueeze(1)
        win = torch.hann_window(n_fft, periodic=True, dtype=torch.float64)
        phase = 2 * math.pi * k * n / n_fft
        analysis = torch.cat([torch.cos(phase) * win, -torch.sin(phase) * win], 0)
        weight = torch.full((bins, 1), 2.0, dtype=torch.float64)
        weight[0] = 1.0
        if n_fft % 2 == 0:
            weight[-1] = 1.0
        synthesis = torch.cat([weight * torch.cos(phase), -weight * torch.sin(phase)], 0) / n_fft * win
        self.register_buffer("analysis", analysis.float().unsqueeze(1))
        self.register_buffer("synthesis", synthesis.float().unsqueeze(1))
        self.register_buffer("win_sq", (win * win).float().view(1, 1, n_fft))

    def forward(self, audio):
        chans, length = audio.shape
        m = self.m
        half = self.n_fft // 2
        padded = F.pad(audio.unsqueeze(1), (half, half), mode="reflect")
        spec = F.conv1d(padded, self.analysis, stride=self.hop)
        real, imag = spec[:, : self.bins], spec[:, self.bins :]
        feats = []
        start = 0
        for i in range(m.nband):
            width = m.band_width[i]
            r = real[:, start : start + width]
            q = imag[:, start : start + width]
            mag = torch.sqrt((r * r + q * q).sum(1, keepdim=True) + m.eps)
            feats.append(m.BN[i](torch.cat([r / mag, q / mag, torch.log(mag)], 1)))
            start += width
        hidden = m.net(torch.stack(feats, 1))
        frames = hidden.shape[-1]
        est_r, est_i = [], []
        for i in range(m.nband):
            ri = m.output[i](hidden[:, i]).view(chans, 2, m.band_width[i], frames)
            est_r.append(ri[:, 0])
            est_i.append(ri[:, 1])
        est = torch.cat([torch.cat(est_r, 1), torch.cat(est_i, 1)], 1)
        ola = F.conv_transpose1d(est, self.synthesis, stride=self.hop)
        ones = torch.ones(1, 1, frames, dtype=est.dtype)
        env = F.conv_transpose1d(ones, self.win_sq, stride=self.hop)
        out = ola / torch.clamp(env, min=1e-11)
        return out[:, 0, half : half + length]


wrapped = ApolloStft(model).eval()

with torch.no_grad():
    probe = torch.randn(2, 44100 * 3) * 0.1
    ref = model(probe.unsqueeze(0)).squeeze(0)
    got = wrapped(probe)
    rel = ((ref - got).abs().max() / ref.abs().max()).item()
print(f"wrapper vs original: relative max error {rel:.2e}")
assert rel < 1e-3

import onnx
import onnxruntime as ort
import numpy as np
from onnxconverter_common import float16

tag = "-dry" if DRY else ""
fp32_path = rf"D:\apollo-x\apollo-44k-fp32{tag}.onnx"
fp16_path = rf"D:\apollo-x\apollo-44k-fp16{tag}.onnx"
example = torch.randn(1, 44100) * 0.1  # оси динамические — для трассировки хватит короткого примера
torch.onnx.export(
    wrapped, (example,), fp32_path,
    input_names=["audio"], output_names=["restored"],
    dynamic_axes={"audio": {0: "channels", 1: "samples"}, "restored": {0: "channels", 1: "samples"}},
    opset_version=17, do_constant_folding=True, dynamo=False,
)
onnx.checker.check_model(fp32_path)

m16 = float16.convert_float_to_float16(onnx.load(fp32_path), keep_io_types=True)
onnx.save(m16, fp16_path)

with torch.no_grad():
    probe = torch.randn(2, 44100 * 2) * 0.1
    ref = wrapped(probe).numpy()
for path in (fp32_path, fp16_path):
    sess = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
    out = sess.run(None, {"audio": probe.numpy()})[0]
    rel = float(np.abs(out - ref).max() / np.abs(ref).max())
    print(f"{path.split(chr(92))[-1]}: relative max error vs torch {rel:.2e}, size {__import__('os').path.getsize(path) / 1e6:.1f} MB")
