import json
import sys
from src.essentia_genre_analyzer import analyze_genre

result = analyze_genre(sys.argv[1])
print(json.dumps(result, ensure_ascii=False))
