"""Download the official English Vosk model. Run from any directory with Python 3."""

import shutil
import tempfile
import urllib.request
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[2]
model_name = "vosk-model-small-en-us-0.15"
target = root / ".local/models" / model_name
if target.is_dir():
    print(f"Model already installed: {target}")
else:
    with tempfile.TemporaryDirectory() as temp:
        archive = Path(temp) / "model.zip"
        print("Downloading the official English speech model (about 40 MB)...", flush=True)
        with (
            urllib.request.urlopen(
                f"https://alphacephei.com/vosk/models/{model_name}.zip", timeout=60
            ) as response,
            archive.open("wb") as output,
        ):
            shutil.copyfileobj(response, output)
        unpack = Path(temp) / "unpacked"
        with zipfile.ZipFile(archive) as bundle:
            for member in bundle.infolist():
                if not (unpack / member.filename).resolve().is_relative_to(unpack.resolve()):
                    raise ValueError("Unsafe model archive")
            bundle.extractall(unpack)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(unpack / model_name), target)
        print(f"Installed: {target}")
print("Run uv sync --extra voice, enable voice in config.yaml, and restart the core.")
