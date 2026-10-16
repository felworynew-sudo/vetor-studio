"""fp32 ONNX Apollo -> fp16 (входы/выходы остаются float32) + проверка на ORT."""
import os
import sys

sys.path.insert(0, r"D:\apollo-x\pylib")

import numpy as np
import onnx
import onnxruntime as ort
from onnx import TensorProto, helper, shape_inference
from onnxconverter_common import float16

SRC = r"D:\apollo-x\apollo-44k-fp32.onnx"
DST = r"D:\apollo-x\apollo-44k-fp16.onnx"

model = shape_inference.infer_shapes(onnx.load(SRC))
types = {}
for vi in list(model.graph.value_info) + list(model.graph.input) + list(model.graph.output):
    types[vi.name] = vi.type.tensor_type.elem_type
for init in model.graph.initializer:
    types[init.name] = init.data_type

# Cast(to=float) над и так float-тензором — пустышка; заменяем на Identity
replaced = 0
for node in model.graph.node:
    if node.op_type == "Cast":
        to = next(a.i for a in node.attribute if a.name == "to")
        if to == TensorProto.FLOAT and types.get(node.input[0]) == TensorProto.FLOAT:
            node.op_type = "Identity"
            del node.attribute[:]
            replaced += 1
print("float->float casts replaced:", replaced)

m16 = float16.convert_float_to_float16(model, keep_io_types=True)

# оставшиеся внутренние Cast(to=float) теперь должны давать fp16
graph_outputs = {o.name for o in m16.graph.output}
fixed = 0
for node in m16.graph.node:
    if node.op_type == "Cast" and node.output[0] not in graph_outputs and "graph_output_cast" not in node.name:
        for a in node.attribute:
            if a.name == "to" and a.i == TensorProto.FLOAT:
                a.i = TensorProto.FLOAT16
                fixed += 1
print("inner casts retargeted to fp16:", fixed)
onnx.save(m16, DST)

rng = np.random.default_rng(0)
probe = (rng.standard_normal((2, 44100 * 2)) * 0.1).astype(np.float32)
ref = ort.InferenceSession(SRC, providers=["CPUExecutionProvider"]).run(None, {"audio": probe})[0]
out = ort.InferenceSession(DST, providers=["CPUExecutionProvider"]).run(None, {"audio": probe})[0]
rel = float(np.abs(out - ref).max() / np.abs(ref).max())
snr = 10 * np.log10(np.sum(ref ** 2) / np.sum((out - ref) ** 2))
print(f"fp16 vs fp32: relative max error {rel:.2e}, SNR {snr:.1f} dB, size {os.path.getsize(DST) / 1e6:.1f} MB")
