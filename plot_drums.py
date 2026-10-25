import librosa
import librosa.display
import matplotlib.pyplot as plt
import numpy as np

audio_path = "separated/htdemucs/test/drums.wav"

y, sr = librosa.load(audio_path, sr=22050, mono=True, duration=10)

plt.figure(figsize=(14, 4))
librosa.display.waveshow(y, sr=sr)
plt.title("Drum audio — first 10 seconds")
plt.xlabel("Time (seconds)")
plt.ylabel("Amplitude")
plt.tight_layout()
plt.savefig("drum_waveform.png", dpi=150)
plt.show()

print("График сохранён в drum_waveform.png")
