"""Smoke-test both buffalo_l models on CUDA; synthetic pixels are not an accuracy test."""

import json
import time

import numpy as np
from arcface import InsightFaceEmbedder

engine = InsightFaceEmbedder("buffalo_l", cpu=False, detector_size=640)
started = time.perf_counter()
faces = engine.faces(np.zeros((480, 640, 3), dtype=np.uint8))
recognizer = engine.app.models["recognition"]
embedding = recognizer.get_feat(np.zeros((112, 112, 3), dtype=np.uint8))
if embedding.shape != (1, 512) or not np.isfinite(embedding).all():
    raise RuntimeError("Unexpected recognition model output")
print(
    json.dumps(
        {
            "buffalo_l_inference_verified": True,
            "synthetic_face_count": len(faces),
            "embedding_shape": list(embedding.shape),
            "cold_smoke_ms": (time.perf_counter() - started) * 1000,
            "providers": {
                name: model.session.get_providers() for name, model in engine.app.models.items()
            },
            "accuracy_tested": False,
        }
    )
)
