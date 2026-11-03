from functools import lru_cache

from transformers import pipeline


MODEL_NAME = "dima806/music_genres_classification"


@lru_cache(maxsize=1)
def _load_model():
    return pipeline(
        "audio-classification",
        model=MODEL_NAME,
        device="mps",
    )


def analyze_genre(audio_path: str, top_k: int = 5) -> dict:
    """Определяет наиболее вероятные жанры аудиотрека."""
    if not 1 <= top_k <= 10:
        raise ValueError("top_k должен быть от 1 до 10")

    predictions = _load_model()(audio_path, top_k=top_k)

    return {
        "model": MODEL_NAME,
        "genres": [
            {
                "genre": item["label"],
                "score": round(float(item["score"]), 4),
            }
            for item in predictions
        ],
    }