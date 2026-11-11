import json
import os
import re
import shutil
import time

RETENTION_SECONDS = 24 * 60 * 60
TRACK_ID_PATTERN = re.compile(r"^[0-9a-f]{32}$")


def cleanup_expired_uploads(
    uploads_dir: str,
    separated_dir: str,
    active_track_ids: set[str] | None = None,
    now: float | None = None,
) -> list[str]:
    if (
        os.path.islink(uploads_dir)
        or not os.path.isdir(uploads_dir)
        or os.path.islink(separated_dir)
    ):
        return []

    current_time = time.time() if now is None else now
    active_ids = active_track_ids or set()
    deleted_ids = []

    try:
        entries = list(os.scandir(uploads_dir))
    except OSError:
        return []

    for entry in entries:
        if not entry.name.endswith(".retention.json"):
            continue

        track_id = entry.name.removesuffix(".retention.json")
        if not TRACK_ID_PATTERN.fullmatch(track_id):
            continue

        if track_id in active_ids or not entry.is_file(follow_symlinks=False):
            continue

        marker_path = entry.path

        try:
            with open(marker_path, encoding="utf-8") as marker_file:
                metadata = json.load(marker_file)

            filename = metadata["filename"]
            uploaded_at = float(metadata["uploaded_at"])

            if not isinstance(filename, str) or not filename:
                continue

            if os.path.basename(filename) != filename:
                continue

            if not filename.startswith(track_id + "."):
                continue

            if not re.fullmatch(r"[0-9a-f]{32}\.[A-Za-z0-9]{1,12}", filename):
                continue

            if not (0 <= uploaded_at <= current_time):
                continue

            if current_time - uploaded_at < RETENTION_SECONDS:
                continue

            original_path = os.path.join(uploads_dir, filename)
            stems_root = os.path.join(separated_dir, "htdemucs")
            stem_dir = os.path.join(stems_root, track_id)

            if os.path.islink(original_path):
                continue

            if os.path.islink(stems_root) or os.path.islink(stem_dir):
                continue

            if os.path.isdir(stem_dir):
                shutil.rmtree(stem_dir)

            if os.path.isfile(original_path):
                os.remove(original_path)

            os.remove(marker_path)
            deleted_ids.append(track_id)

        except (OSError, KeyError, ValueError, TypeError, json.JSONDecodeError):
            continue

    return deleted_ids
