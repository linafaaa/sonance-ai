import asyncio
import base64
import json
import logging
import os
import re
import shutil
import sys
import subprocess
import threading
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from mutagen import File as MutagenFile
from starlette.background import BackgroundTask
from starlette.responses import JSONResponse

from src.storage_cleanup import cleanup_expired_uploads

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))

ESSENTIA_ENV = os.getenv(
    "ESSENTIA_PYTHON",
    os.path.join(PROJECT_ROOT, ".venv-essentia", "bin", "python"),
)
DEMUCS_ENV = os.getenv(
    "DEMUCS_PYTHON",
    os.path.join(PROJECT_ROOT, ".venv", "bin", "python"),
)
ESSENTIA_ROOT = PROJECT_ROOT
UPLOADS_DIR = os.path.join(PROJECT_ROOT, "uploads")
SEPARATED_DIR = os.path.join(PROJECT_ROOT, "separated")

ESSENTIA_ENV_VARS = os.environ.copy()

essentia_library_dir = os.getenv(
    "ESSENTIA_LIBRARY_DIR",
    os.path.join(PROJECT_ROOT, "essentia-local", "lib"),
)
essentia_site_packages = os.getenv(
    "ESSENTIA_SITE_PACKAGES",
    os.path.join(
        PROJECT_ROOT, "essentia-local", "lib", "python3.11", "site-packages"
    ),
)
library_path_variable = (
    "DYLD_LIBRARY_PATH" if sys.platform == "darwin" else "LD_LIBRARY_PATH"
)
ESSENTIA_ENV_VARS[library_path_variable] = os.pathsep.join(
    filter(
        None,
        [
            essentia_library_dir,
            ESSENTIA_ENV_VARS.get(library_path_variable),
        ],
    )
)
ESSENTIA_ENV_VARS["PYTHONPATH"] = os.pathsep.join(
    filter(
        None,
        [
            essentia_site_packages,
            PROJECT_ROOT,
            ESSENTIA_ENV_VARS.get("PYTHONPATH"),
        ],
    )
)


MAX_UPLOAD_SIZE = 50 * 1024 * 1024
UPLOAD_CHUNK_SIZE = 1024 * 1024


class UploadTooLargeError(Exception):
    pass


MAX_REQUEST_SIZE = MAX_UPLOAD_SIZE + 1024 * 1024


class RequestSizeLimitMiddleware:
    def __init__(self, app, max_request_size: int):
        self.app = app
        self.max_request_size = max_request_size

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("path") != "/analyze/genre":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        content_length = headers.get(b"content-length")

        if content_length:
            try:
                request_size = int(content_length)
            except ValueError:
                request_size = 0

            if request_size > self.max_request_size:
                response = JSONResponse(
                    status_code=413,
                    content={
                        "detail": "Request body is too large. The maximum audio file size is 50 MB."
                    },
                )
                await response(scope, receive, send)
                return

        received_size = 0

        async def limited_receive():
            nonlocal received_size
            message = await receive()

            if message["type"] == "http.request":
                received_size += len(message.get("body", b""))
                if received_size > self.max_request_size:
                    raise HTTPException(
                        status_code=413,
                        detail="Request body is too large. The maximum audio file size is 50 MB.",
                    )

            return message

        await self.app(scope, limited_receive, send)


def save_uploaded_file(file: UploadFile, destination: str) -> None:
    total_size = 0

    try:
        with open(destination, "wb") as temp:
            while chunk := file.file.read(UPLOAD_CHUNK_SIZE):
                total_size += len(chunk)
                if total_size > MAX_UPLOAD_SIZE:
                    raise UploadTooLargeError
                temp.write(chunk)
    except UploadTooLargeError:
        if os.path.isfile(destination) and not os.path.islink(destination):
            os.remove(destination)
        raise


def write_retention_marker(
    marker_tmp_path: str, marker_path: str, marker_data: dict
) -> None:
    with open(marker_tmp_path, "w", encoding="utf-8") as marker_file:
        json.dump(marker_data, marker_file)
    os.replace(marker_tmp_path, marker_path)


class InvalidAudioFileError(Exception):
    pass


def validate_audio_file(audio_path: str) -> None:
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "stream=codec_type",
                "-of",
                "json",
                audio_path,
            ],
            capture_output=True,
            text=True,
            check=True,
            timeout=30,
        )
        streams = json.loads(result.stdout).get("streams", [])
    except (
        subprocess.SubprocessError,
        OSError,
        json.JSONDecodeError,
    ) as exc:
        raise InvalidAudioFileError from exc

    if not any(stream.get("codec_type") == "audio" for stream in streams):
        raise InvalidAudioFileError


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
            cover_url = f"data:{picture.mime};base64," + base64.b64encode(
                picture.data
            ).decode("ascii")

    if cover_url is None and audio:
        pictures = getattr(audio, "pictures", None)
        if pictures:
            picture = pictures[0]
            mime = getattr(picture, "mime", "image/jpeg")
            cover_url = f"data:{mime};base64," + base64.b64encode(picture.data).decode(
                "ascii"
            )

    return {"title": title, "artist": artist, "cover_url": cover_url}


def analyze_genre(audio_path: str) -> dict:
    try:
        result = subprocess.run(
            [ESSENTIA_ENV, "-m", "src.essentia_worker", audio_path],
            cwd=ESSENTIA_ROOT,
            env=ESSENTIA_ENV_VARS,
            capture_output=True,
            text=True,
            check=True,
            timeout=300,
        )
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or "").strip()
        logger.error(
            "Essentia worker exited with code %s. stderr: %s",
            exc.returncode,
            stderr[-4000:] if stderr else "(empty)",
        )
        raise

    lines = [line for line in result.stdout.splitlines() if line.strip()]
    return json.loads(lines[-1])


logger = logging.getLogger("sonance.api")

ACTIVE_TRACK_IDS: set[str] = set()
ACTIVE_DOWNLOADS: dict[str, int] = {}
TRACKS_LOCK = threading.RLock()
ANALYSIS_SEMAPHORE = threading.BoundedSemaphore(1)


def run_storage_cleanup():
    with TRACKS_LOCK:
        active_ids = ACTIVE_TRACK_IDS | {
            track_id for track_id, count in ACTIVE_DOWNLOADS.items() if count > 0
        }
        return cleanup_expired_uploads(
            UPLOADS_DIR,
            SEPARATED_DIR,
            active_track_ids=active_ids,
        )


async def cleanup_loop():
    while True:
        try:
            deleted_ids = await asyncio.to_thread(run_storage_cleanup)
            if deleted_ids:
                logger.info("24-hour cleanup removed %d tracks", len(deleted_ids))
        except Exception:
            logger.exception("Storage cleanup failed")
        await asyncio.sleep(60 * 60)


@asynccontextmanager
async def lifespan(app):
    try:
        deleted_ids = await asyncio.to_thread(run_storage_cleanup)
        if deleted_ids:
            logger.info("Startup cleanup removed %d tracks", len(deleted_ids))
    except Exception:
        logger.exception("Startup storage cleanup failed")

    cleanup_task = asyncio.create_task(cleanup_loop())
    try:
        yield
    finally:
        cleanup_task.cancel()
        try:
            await cleanup_task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="SONANCE AI API", lifespan=lifespan)
app.add_middleware(
    RequestSizeLimitMiddleware,
    max_request_size=MAX_REQUEST_SIZE,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip().rstrip("/")
        for origin in os.getenv(
            "CORS_ORIGINS", "http://localhost:5173"
        ).split(",")
        if origin.strip()
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "SONANCE AI"}


@app.post("/analyze/genre")
async def analyze_audio(file: UploadFile = File(...)):  # noqa: B008
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file was selected.")

    original_filename = os.path.basename(file.filename)
    suffix = os.path.splitext(original_filename)[1]
    if not re.fullmatch(r"\.[A-Za-z0-9]{1,12}", suffix or ""):
        suffix = ".audio"

    track_id = uuid.uuid4().hex
    os.makedirs(UPLOADS_DIR, exist_ok=True)
    os.makedirs(SEPARATED_DIR, exist_ok=True)

    temp_path = os.path.join(UPLOADS_DIR, f"{track_id}{suffix}")
    marker_path = os.path.join(UPLOADS_DIR, f"{track_id}.retention.json")
    marker_tmp_path = marker_path + ".tmp"
    stem_dir = os.path.join(SEPARATED_DIR, "htdemucs", track_id)

    if not ANALYSIS_SEMAPHORE.acquire(blocking=False):
        raise HTTPException(
            status_code=503,
            detail="The server is already processing another track. Please try again later.",
        )

    with TRACKS_LOCK:
        ACTIVE_TRACK_IDS.add(track_id)

    try:
        await file.seek(0)
        await asyncio.to_thread(save_uploaded_file, file, temp_path)
        await asyncio.to_thread(validate_audio_file, temp_path)

        marker_data = {
            "filename": os.path.basename(temp_path),
            "uploaded_at": time.time(),
        }
        await asyncio.to_thread(
            write_retention_marker, marker_tmp_path, marker_path, marker_data
        )

        result = await asyncio.to_thread(analyze_genre, temp_path)
        metadata = await asyncio.to_thread(
            extract_track_metadata, temp_path, original_filename
        )

        demucs_python = DEMUCS_ENV
        await asyncio.to_thread(
            subprocess.run,
            [
                demucs_python,
                "-m",
                "demucs.separate",
                "-n",
                "htdemucs",
                "-d",
                "cpu",
                "-o",
                SEPARATED_DIR,
                temp_path,
            ],
            cwd=ESSENTIA_ROOT,
            capture_output=True,
            text=True,
            check=True,
            timeout=900,
        )

        return {
            "filename": file.filename,
            "track_id": track_id,
            **metadata,
            **result,
        }

    except UploadTooLargeError as exc:
        raise HTTPException(
            status_code=413,
            detail="The file is too large. The maximum file size is 50 MB.",
        ) from exc

    except InvalidAudioFileError as exc:
        try:
            if os.path.isfile(temp_path) and not os.path.islink(temp_path):
                os.remove(temp_path)
        except OSError:
            logger.exception(
                "Failed to remove invalid uploaded file for track %s", track_id
            )

        raise HTTPException(
            status_code=415,
            detail="The file is not a supported audio format or is corrupted.",
        ) from exc

    except Exception as exc:
        logger.exception("Audio analysis failed for track %s", track_id)

        try:
            for cleanup_path in (temp_path, marker_path, marker_tmp_path):
                if os.path.isfile(cleanup_path) and not os.path.islink(cleanup_path):
                    os.remove(cleanup_path)

            if os.path.isdir(stem_dir) and not os.path.islink(stem_dir):
                shutil.rmtree(stem_dir)
        except OSError:
            logger.exception("Failed to remove partial files for track %s", track_id)

        timed_out = isinstance(exc, subprocess.TimeoutExpired)
        raise HTTPException(
            status_code=504 if timed_out else 500,
            detail=(
                "Audio analysis timed out. Please try another file later."
                if timed_out
                else "Audio analysis failed. Please try another file or try again later."
            ),
        ) from exc

    finally:
        try:
            with TRACKS_LOCK:
                ACTIVE_TRACK_IDS.discard(track_id)
            await file.close()
        finally:
            ANALYSIS_SEMAPHORE.release()


def release_download(track_id: str):
    with TRACKS_LOCK:
        count = ACTIVE_DOWNLOADS.get(track_id, 0)
        if count <= 1:
            ACTIVE_DOWNLOADS.pop(track_id, None)
        else:
            ACTIVE_DOWNLOADS[track_id] = count - 1


@app.get("/stems/{track_id}/{stem_name}")
def get_stem(track_id: str, stem_name: str):
    allowed_stems = {"vocals", "drums", "bass", "other"}

    if stem_name not in allowed_stems:
        raise HTTPException(status_code=404, detail="Stem not found")

    if not re.fullmatch(r"[0-9a-f]{32}", track_id):
        raise HTTPException(status_code=400, detail="Invalid track ID")

    stems_root = os.path.join(SEPARATED_DIR, "htdemucs")
    track_dir = os.path.join(stems_root, track_id)
    stem_path = os.path.join(track_dir, f"{stem_name}.wav")

    with TRACKS_LOCK:
        if (
            os.path.islink(SEPARATED_DIR)
            or os.path.islink(stems_root)
            or os.path.islink(track_dir)
            or os.path.islink(stem_path)
            or not os.path.isfile(stem_path)
        ):
            raise HTTPException(status_code=404, detail="Audio file not found")

        ACTIVE_DOWNLOADS[track_id] = ACTIVE_DOWNLOADS.get(track_id, 0) + 1

    try:
        return FileResponse(
            stem_path,
            media_type="audio/wav",
            background=BackgroundTask(release_download, track_id),
        )
    except Exception:
        release_download(track_id)
        raise
