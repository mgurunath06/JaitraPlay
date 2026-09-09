"""Execute a matrix multiplication and require evidence of CUDA kernel execution."""

import json
import tempfile
from pathlib import Path

import numpy as np
import onnxruntime as ort
from onnx import TensorProto, helper

ort.preload_dlls(directory="")
with tempfile.TemporaryDirectory(prefix="jaitra-cuda-") as directory:
    options = ort.SessionOptions()
    options.enable_profiling = True
    options.profile_file_prefix = str(Path(directory) / "profile")
    graph = helper.make_graph(
        [helper.make_node("MatMul", ["a", "b"], ["c"])],
        "cuda-check",
        [helper.make_tensor_value_info(name, TensorProto.FLOAT, [64, 64]) for name in ("a", "b")],
        [helper.make_tensor_value_info("c", TensorProto.FLOAT, [64, 64])],
    )
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 13)])
    model.ir_version = 10
    session = ort.InferenceSession(
        model.SerializeToString(),
        options,
        providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
    )
    value = np.ones((64, 64), dtype=np.float32)
    result = session.run(None, {"a": value, "b": value})[0]
    np.testing.assert_allclose(result, 64)
    events = json.loads(Path(session.end_profiling()).read_text())
    if not any(
        event.get("args", {}).get("provider") == "CUDAExecutionProvider" for event in events
    ):
        raise RuntimeError("CUDA did not execute the test kernel; CPU fallback is not a pass")
    print(
        json.dumps(
            {
                "cuda_kernel_verified": True,
                "onnxruntime": ort.__version__,
                "providers": session.get_providers(),
            }
        )
    )
