"""Offline swappable InsightFace runner; never changes the live application's model."""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Protocol

from score import decide, enrolled_people, iou, load_manifest


class Embedder(Protocol):
    def faces(self, image) -> list[dict]: ...


class InsightFaceEmbedder:
    def __init__(self, model: str, cpu: bool, detector_size: int):
        import onnxruntime as ort
        from insightface.app import FaceAnalysis

        if not cpu:
            ort.preload_dlls(directory="")
        if not cpu and "CUDAExecutionProvider" not in ort.get_available_providers():
            raise RuntimeError(
                "CUDA unavailable. Install compatible onnxruntime-gpu "
                "or explicitly use --cpu for functional checks."
            )
        self.app = FaceAnalysis(
            name=model,
            root=str(Path(__file__).resolve().parents[2] / ".local/models/insightface"),
            allowed_modules=["detection", "recognition"],
            providers=["CPUExecutionProvider"]
            if cpu
            else ["CUDAExecutionProvider", "CPUExecutionProvider"],
        )
        self.app.prepare(ctx_id=-1 if cpu else 0, det_size=(detector_size, detector_size))
        if not cpu:
            for item in self.app.models.values():
                if "CUDAExecutionProvider" not in item.session.get_providers():
                    raise RuntimeError(
                        "A model fell back to CPU; refusing to label this a GPU benchmark"
                    )

    def faces(self, image):
        import cv2
        import numpy as np

        height, width = image.shape[:2]
        result = []
        for face in self.app.get(image):
            x1, y1, x2, y2 = map(float, face.bbox)
            crop = image[
                max(0, int(y1)) : min(height, int(y2)), max(0, int(x1)) : min(width, int(x2))
            ]
            gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if crop.size else None
            vector = np.asarray(face.embedding, dtype=float)
            vector /= max(float(np.linalg.norm(vector)), 1e-12)
            result.append(
                dict(
                    box=dict(
                        x=x1 / width,
                        y=y1 / height,
                        width=(x2 - x1) / width,
                        height=(y2 - y1) / height,
                    ),
                    confidence=float(face.det_score),
                    blur=float(cv2.Laplacian(gray, cv2.CV_64F, ksize=1).var())
                    if gray is not None
                    else None,
                    luminance=float(gray.mean()) if gray is not None else None,
                    descriptor=vector,
                )
            )
        return result


def frame_at(path, second, analysis_width):
    import cv2

    capture = cv2.VideoCapture(str(path))
    try:
        capture.set(cv2.CAP_PROP_POS_MSEC, second * 1000)
        ok, frame = capture.read()
        if not ok:
            raise ValueError(f"Cannot decode {path} at {second}s")
        height, width = frame.shape[:2]
        if analysis_width:
            frame = cv2.resize(frame, (analysis_width, round(height * analysis_width / width)))
        return frame, width, height
    finally:
        capture.release()


def main():
    import numpy as np

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest")
    parser.add_argument("output")
    parser.add_argument("--model", default="buffalo_l")
    parser.add_argument("--cpu", action="store_true")
    parser.add_argument(
        "--analysis-width",
        type=int,
        default=640,
        help="640 matches baseline; 0 uses source resolution as a separate experiment",
    )
    parser.add_argument("--detector-size", type=int, default=640)
    parser.add_argument(
        "--threshold",
        type=float,
        required=True,
        help="Explicit experimental cosine threshold; calibrate on calibration split",
    )
    parser.add_argument(
        "--margin",
        type=float,
        default=0,
        help="Exploratory runner-up margin; calibrate jointly with threshold",
    )
    parser.add_argument(
        "--secondary-photos",
        type=Path,
        help="Optional folder of parent-confirmed child-only photos; separate gallery experiment",
    )
    args = parser.parse_args()
    if not 0 <= args.margin <= 2:
        parser.error("Margin must be between 0 and 2")
    if not -1 <= args.threshold <= 1:
        parser.error("Cosine threshold must be between -1 and 1")
    if args.analysis_width < 0 or args.detector_size < 32:
        parser.error("Invalid analysis width or detector size")
    manifest = load_manifest(args.manifest)
    root = Path(args.manifest).resolve().parent
    engine: Embedder = InsightFaceEmbedder(args.model, args.cpu, args.detector_size)
    people = enrolled_people(manifest)
    galleries = {person: [] for person in people}
    for clip in manifest["clips"]:
        if clip["split"] != "enrollment":
            continue
        for label in clip["frames"]:
            image, _, _ = frame_at(root / clip["path"], label["time"], args.analysis_width)
            found = engine.faces(image)
            for truth in label["faces"]:
                if truth["label"] not in galleries:
                    continue
                candidates = [f for f in found if iou(f["box"], truth["box"]) >= 0.3]
                if (
                    len(candidates) == 1
                    and sum(iou(f["box"], candidates[0]["box"]) >= 0.3 for f in label["faces"]) == 1
                ):
                    galleries[truth["label"]].append(candidates[0]["descriptor"])
    if not any(galleries.values()):
        raise ValueError("No unambiguous enrolled faces in enrollment annotations")
    primary_gallery_size = sum(map(len, galleries.values()))
    if args.secondary_photos:
        if "jaitra" not in galleries:
            raise ValueError("Secondary child photos require jaitra in enrolledPeople")
        import cv2

        for photo in sorted(args.secondary_photos.iterdir()):
            if photo.suffix.lower() not in (".jpg", ".jpeg", ".png"):
                continue
            image = cv2.imread(str(photo))
            if image is None:
                raise ValueError(f"Cannot read secondary photo {photo.name}")
            if args.analysis_width:
                height, width = image.shape[:2]
                image = cv2.resize(
                    image, (args.analysis_width, round(height * args.analysis_width / width))
                )
            found = engine.faces(image)
            if len(found) != 1:
                raise ValueError(f"Secondary photo must contain exactly one face: {photo.name}")
            galleries["jaitra"].append(found[0]["descriptor"])
    gallery_sizes = {person: len(samples) for person, samples in galleries.items()}
    galleries = {person: np.stack(samples) for person, samples in galleries.items() if samples}
    with Path(args.output).open("x") as output:
        for clip in manifest["clips"]:
            if clip["split"] == "enrollment":
                continue
            for label in clip["frames"]:
                image, width, height = frame_at(
                    root / clip["path"], label["time"], args.analysis_width
                )
                started = time.perf_counter()
                faces = engine.faces(image)
                for face in faces:
                    descriptor = face.pop("descriptor")
                    face["scores"] = {
                        person: float(np.max(gallery @ descriptor))
                        for person, gallery in galleries.items()
                    }
                    ranked = sorted(face["scores"].items(), key=lambda p: -p[1])
                    face["candidate"], face["score"] = ranked[0]
                    face["margin"] = ranked[0][1] - ranked[1][1] if len(ranked) > 1 else None
                    face["decision"] = decide(
                        face, {"threshold": args.threshold, "margin": args.margin}
                    )
                    face["sourceFaceWidthPx"] = face["box"]["width"] * width
                    face["analysisFaceWidthPx"] = face["box"]["width"] * image.shape[1]
                row = dict(
                    schema=2,
                    model=args.model,
                    session=clip["session"],
                    clip=clip["id"],
                    time=label["time"],
                    sourceWidth=width,
                    sourceHeight=height,
                    requestedAnalysisWidth=args.analysis_width,
                    analysisWidth=image.shape[1],
                    detectorSize=args.detector_size,
                    backend="cpu" if args.cpu else "cuda",
                    gallerySize=sum(gallery_sizes.values()),
                    gallerySizes=gallery_sizes,
                    enrolledPeople=people,
                    secondaryGallerySize=sum(gallery_sizes.values()) - primary_gallery_size,
                    metric="cosine_max",
                    latencyScope="detection_embedding_metrics_and_matching",
                    threshold=args.threshold,
                    margin=args.margin,
                    latencyMs=(time.perf_counter() - started) * 1000,
                    faces=faces,
                )
                output.write(json.dumps(row, allow_nan=False) + "\n")


if __name__ == "__main__":
    main()
