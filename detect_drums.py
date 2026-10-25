import librosa
import numpy as np

audio_path = "separated/htdemucs/test/drums.wav"

# Загружаем аудио в моно для анализа
y, sr = librosa.load(audio_path, sr=22050, mono=True)

# Вычисляем резкие изменения энергии — возможные начала ударов
onset_env = librosa.onset.onset_strength(y=y, sr=sr)

# Находим предполагаемые моменты ударов
frames = librosa.onset.onset_detect(
    onset_envelope=onset_env,
    sr=sr,
    units="frames",
    backtrack=False
)

times = librosa.frames_to_time(frames, sr=sr)

print(f"Длительность аудио: {len(y) / sr:.2f} сек.")
print(f"Найдено предполагаемых ударов: {len(times)}")
print("\nПервые 20 моментов (секунды):")
for t in times[:20]:
    print(f"{t:.3f}")
