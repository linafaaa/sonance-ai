import json
import os
from functools import lru_cache

import librosa
import numpy as np
from essentia.standard import (
    Danceability,
    MonoLoader,
    TensorflowPredict2D,
    TensorflowPredictEffnetDiscogs,
    TensorflowPredictMusiCNN,
)

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(PROJECT_ROOT, "models")

BASE_DIR = os.path.join(MODELS_DIR, "discogs-effnet")
EMBEDDING_MODEL = os.path.join(BASE_DIR, "discogs-effnet-bs64-1.pb")
CLASSIFIER_MODEL = os.path.join(BASE_DIR, "genre_discogs400-discogs-effnet-1.pb")
METADATA_FILE = os.path.join(BASE_DIR, "genre_discogs400-discogs-effnet-1.json")
MUSICNN_MODEL = os.path.join(MODELS_DIR, "musicnn", "msd-musicnn-1.pb")
DEAM_MODEL = os.path.join(MODELS_DIR, "deam", "deam-msd-musicnn-2.pb")


@lru_cache(maxsize=1)
def _load_models():
    embedding_model = TensorflowPredictEffnetDiscogs(
        graphFilename=EMBEDDING_MODEL,
        output="PartitionedCall:1",
    )
    classifier = TensorflowPredict2D(
        graphFilename=CLASSIFIER_MODEL,
        input="serving_default_model_Placeholder",
        output="PartitionedCall:0",
    )
    with open(METADATA_FILE, encoding="utf-8") as f:
        labels = json.load(f)["classes"]
    return embedding_model, classifier, labels


@lru_cache(maxsize=1)
def _load_emotion_models():
    musicnn = TensorflowPredictMusiCNN(
        graphFilename=MUSICNN_MODEL,
        output="model/dense/BiasAdd",
    )
    emotion_model = TensorflowPredict2D(
        graphFilename=DEAM_MODEL,
        input="model/Placeholder",
        output="model/Identity",
    )
    return musicnn, emotion_model


def analyze_audio_features(y: np.ndarray, sr: int) -> dict:
    """Calculate signal-based audio features; these are not model predictions."""
    eps = 1e-10

    rms = librosa.feature.rms(y=y)[0]
    energy = float(np.mean(rms))
    loudness_db = float(20 * np.log10(max(energy, eps)))

    centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
    bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=sr)[0]
    zcr = librosa.feature.zero_crossing_rate(y)[0]

    harmonic, percussive = librosa.effects.hpss(y)
    harmonic_energy = float(np.mean(harmonic**2))
    percussive_energy = float(np.mean(percussive**2))
    acousticness = harmonic_energy / max(harmonic_energy + percussive_energy, eps)

    chroma = librosa.feature.chroma_stft(y=y, sr=sr)
    note_names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"]
    major_profile = np.array(
        [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
    )
    minor_profile = np.array(
        [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
    )
    chroma_mean = np.mean(chroma, axis=1)

    key_candidates = []
    for shift in range(12):
        key_candidates.append(
            (
                np.corrcoef(chroma_mean, np.roll(major_profile, shift))[0, 1],
                note_names[shift] + " Major",
            )
        )
        key_candidates.append(
            (
                np.corrcoef(chroma_mean, np.roll(minor_profile, shift))[0, 1],
                note_names[shift] + " Minor",
            )
        )
    key_name = max(key_candidates, key=lambda item: item[0])[1]

    return {
        "key": key_name,
        "energy": round(float(np.clip(energy * 300, 0, 1)), 2),
        "loudness_db": round(loudness_db, 1),
        "acousticness": round(float(np.clip(acousticness, 0, 1)), 2),
        "spectral_centroid_hz": round(float(np.mean(centroid)), 1),
        "spectral_bandwidth_hz": round(float(np.mean(bandwidth)), 1),
        "zero_crossing_rate": round(float(np.mean(zcr)), 4),
    }


def analyze_genre(audio_path: str) -> dict:
    y, sr = librosa.load(audio_path, sr=22050, mono=True, duration=90)
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    bpm = round(float(tempo[0] if hasattr(tempo, "__len__") else tempo), 1)
    features = analyze_audio_features(y, sr)
    embedding_model, classifier, labels = _load_models()

    audio = MonoLoader(
        filename=audio_path,
        sampleRate=16000,
        resampleQuality=4,
    )()
    embeddings = embedding_model(audio)
    predictions = classifier(embeddings)
    scores = np.mean(predictions, axis=0)

    musicnn_model, emotion_model = _load_emotion_models()
    emotion_embeddings = musicnn_model(audio)
    emotion_predictions = np.asarray(emotion_model(emotion_embeddings))
    emotion_values = np.mean(emotion_predictions, axis=0)
    valence = float(emotion_values[0])
    arousal = float(emotion_values[1])

    ranked = np.argsort(scores)[::-1]
    primary = int(ranked[0])

    main_label = labels[primary]
    if "---" in main_label:
        genre, subgenre = main_label.split("---", 1)
    else:
        genre, subgenre = main_label, None

    subgenres = []
    for index in ranked[1:]:
        label = labels[int(index)]
        if "---" in label:
            candidate_genre, candidate_subgenre = label.split("---", 1)
            if candidate_genre == genre and candidate_subgenre not in subgenres:
                subgenres.append(candidate_subgenre)
        if len(subgenres) == 3:
            break

    danceability_value, _ = Danceability(sampleRate=sr)(y.astype(np.float32))

    return {
        "valence": round(valence, 3),
        "arousal": round(arousal, 3),
        "danceability": round(float(danceability_value), 3),
        "model": "Essentia Discogs-EffNet / Discogs400",
        "genre": genre,
        "bpm": bpm,
        **features,
        "subgenre": subgenre,
        "related_subgenres": subgenres,
    }
