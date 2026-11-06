# SONANCE AI

SONANCE AI is a web application for exploring the structure and measurable characteristics of audio tracks. It combines model-based music analysis with source-separated playback in a single workspace.

## Capabilities

- Upload an audio track for analysis (maximum file size: 50 MB).
- Estimate genre, tempo, musical key, and mood.
- Inspect signal-derived audio characteristics, including loudness and spectral features.
- Separate audio into vocals, drums, bass, and other stems with Demucs.
- Play the original track and control available stems independently.

Genre and mood are estimates, not ground-truth labels. Signal-derived measurements are identified separately in the interface.

## Architecture

- **Frontend:** React, TypeScript, and Vite.
- **API:** FastAPI.
- **Audio analysis:** Essentia and librosa.
- **Source separation:** Demucs with the HTDemucs model.

## Repository layout

```text
api.py                      FastAPI application
src/essentia_genre_analyzer.py
src/essentia_worker.py      Essentia analysis worker
src/storage_cleanup.py     Expired upload and stem cleanup
web/                        React application
models/                     Local model assets (not committed)
uploads/                    Temporary uploaded audio (not committed)
separated/                  Generated stems (not committed)
```

## Requirements

- Python environments for the API, Essentia analysis worker, and Demucs runtime.
- Node.js and npm for frontend development and production builds.
- Essentia model assets and the HTDemucs model available locally.

Model weights and generated audio are intentionally excluded from version control. The analyzer expects these model files:

- `models/discogs-effnet/discogs-effnet-bs64-1.pb`
- `models/discogs-effnet/genre_discogs400-discogs-effnet-1.pb`
- `models/discogs-effnet/genre_discogs400-discogs-effnet-1.json`
- `models/musicnn/msd-musicnn-1.pb`
- `models/deam/deam-msd-musicnn-2.pb`

By default, the API uses `.venv-essentia/bin/python` for Essentia and `.venv/bin/python` for Demucs. Override these paths with `ESSENTIA_PYTHON` and `DEMUCS_PYTHON` when your environments live elsewhere.

Optional environment variables:

- `ESSENTIA_LIBRARY_DIR` — directory containing Essentia shared libraries (defaults to `essentia-local/lib`).
- `ESSENTIA_SITE_PACKAGES` — Essentia Python packages directory (defaults to the local Python 3.11 site-packages path).
- `CORS_ORIGINS` — comma-separated list of allowed frontend origins (defaults to `http://localhost:5173`).
- `VITE_API_BASE_URL` — frontend API origin; leave unset to use the same origin in production or the local API default during development.

Configure the environments and install their runtime dependencies before starting the API.

## Frontend development

```bash
cd web
npm ci
npm run dev
```

Create a production build:

```bash
npm run build
```

Run the frontend linter:

```bash
npm run lint
```

## Backend development

From the repository root, start the API after configuring the Python environments and model assets:

```bash
.venv/bin/python -m uvicorn api:app --host 127.0.0.1 --port 8000
```

The API exposes:

- `GET /health` — service health check.
- `POST /analyze/genre` — analyze an uploaded audio file and create separated stems.
- `GET /stems/{track_id}/{stem_name}` — stream an available stem (`vocals`, `drums`, `bass`, or `other`).

Uploads and generated stems are temporary runtime data. The service performs periodic cleanup of expired files.
