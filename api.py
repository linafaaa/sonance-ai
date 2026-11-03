import os
import re
import tempfile
import uuid

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

import json
import subprocess
import base64
from mutagen import File as MutagenFile

ESSENTIA_ENV = os.path.expanduser('~/drum-ai/.venv-essentia/bin/python')
ESSENTIA_ROOT = os.path.expanduser('~/drum-ai')
UPLOADS_DIR = os.path.expanduser("~/drum-ai/uploads")
SEPARATED_DIR = os.path.expanduser("~/drum-ai/separated")

ESSENTIA_ENV_VARS = os.environ.copy()
ESSENTIA_ENV_VARS['DYLD_LIBRARY_PATH'] = os.path.expanduser('~/drum-ai/essentia-local/lib')
ESSENTIA_ENV_VARS['PYTHONPATH'] = os.path.expanduser('~/drum-ai/essentia-local/lib/python3.11/site-packages:~/drum-ai')

def extract_track_metadata(audio_path: str, original_filename: str) -> dict:
    audio = MutagenFile(audio_path)
    tags = audio.tags if audio else None

    def get_tag(*keys):
        if not tags:
            return ""
        for key in keys:
            value = tags.get(key)
            if value:
                if key == "APIC":
                    continue
                try:
                    return str(value[0])
                except (TypeError, IndexError, KeyError):
                    return str(value)
        return ""

    title = get_tag("TIT2", "title") or os.path.splitext(original_filename)[0]
    artist = get_tag("TPE1", "artist", "ARTIST", "©ART")
    cover_url = None

    if tags and hasattr(tags, "getall"):
        pictures = tags.getall("APIC")
        if pictures:
            picture = pictures[0]
            cover_url = (
                f"data:{picture.mime};base64,"
                + base64.b64encode(picture.data).decode("ascii")
            )

    if cover_url is None and audio:
        pictures = getattr(audio, "pictures", None)
        if pictures:
            picture = pictures[0]
            mime = getattr(picture, "mime", "image/jpeg")
            cover_url = (
                f"data:{mime};base64,"
                + base64.b64encode(picture.data).decode("ascii")
            )

    return {"title": title, "artist": artist, "cover_url": cover_url}


def analyze_genre(audio_path: str) -> dict:
    result = subprocess.run(
        [ESSENTIA_ENV, '-m', 'src.essentia_worker', audio_path],
        cwd=ESSENTIA_ROOT,
        env=ESSENTIA_ENV_VARS,
        capture_output=True,
        text=True,
        check=True,
    )
    lines = [line for line in result.stdout.splitlines() if line.strip()]
    return json.loads(lines[-1])

app = FastAPI(title="SONANCE AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "SONANCE AI"}


@app.post("/analyze/genre")
async def analyze_audio(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Файл не выбран")

    suffix = os.path.splitext(file.filename)[1] or ".mp3"
    track_id = uuid.uuid4().hex
    os.makedirs(UPLOADS_DIR, exist_ok=True)
    os.makedirs(SEPARATED_DIR, exist_ok=True)
    temp_path = os.path.join(UPLOADS_DIR, f"{track_id}{suffix}")

    try:
        with open(temp_path, "wb") as temp:
            while chunk := await file.read(1024 * 1024):
                temp.write(chunk)

        result = analyze_genre(temp_path)
        metadata = extract_track_metadata(temp_path, file.filename)

        demucs_python = os.path.expanduser("~/drum-ai/.venv/bin/python")
        subprocess.run(
            [
                demucs_python, "-m", "demucs.separate",
                "-n", "htdemucs", "-d", "cpu",
                "-o", SEPARATED_DIR, temp_path,
            ],
            cwd=ESSENTIA_ROOT,
            capture_output=True,
            text=True,
            check=True,
        )

        return {
            "filename": file.filename,
            "track_id": track_id,
            **metadata,
            **result,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Не удалось проанализировать аудио: {exc}",
        ) from exc

    finally:
        await file.close()

@app.get("/stems/{track_id}/{stem_name}")
def get_stem(track_id: str, stem_name: str):
    allowed_stems = {"vocals", "drums", "bass", "other"}

    if stem_name not in allowed_stems:
        raise HTTPException(status_code=404, detail="Stem not found")

    if not re.fullmatch(r"[0-9a-f]{32}", track_id):
        raise HTTPException(status_code=400, detail="Invalid track ID")

    stem_path = os.path.join(
        SEPARATED_DIR, "htdemucs", track_id, f"{stem_name}.wav"
    )

    if not os.path.isfile(stem_path):
        raise HTTPException(status_code=404, detail="Audio file not found")

    return FileResponse(stem_path, media_type="audio/wav")