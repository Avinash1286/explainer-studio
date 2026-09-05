"""Scene-level Kokoro synthesis. Input/output are local JSON/files, never shell text."""
import json
import os
import sys
import time
from pathlib import Path

os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
import numpy as np
import soundfile as sf
import torch
from kokoro import KPipeline

torch.set_num_threads(int(os.environ.get("TTS_THREADS", "2")))
started = time.monotonic()
project = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
destination = Path(sys.argv[2]).resolve()
destination.mkdir(parents=True, exist_ok=True)
pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M", device="cpu")
results = []
for index, scene in enumerate(project["scenes"]):
    pieces, words, offset = [], [], 0.0
    for result in pipeline(scene["narration"], voice=project["voice"], speed=project["speed"]):
        audio = result.audio.numpy()
        pieces.append(audio)
        for token in result.tokens or []:
            if token.start_ts is not None and token.end_ts is not None:
                words.append({"text": token.text, "start": offset + token.start_ts, "end": offset + token.end_ts})
        offset += len(audio) / 24000
    audio = np.concatenate(pieces)
    name = f"scene-{index}.wav"
    sf.write(destination / name, audio, 24000, subtype="PCM_16")
    results.append({"file": name, "seconds": len(audio) / 24000, "words": words})
peak = None
if sys.platform != "win32":
    import resource
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
report = {"scenes": results, "synthesisSeconds": time.monotonic() - started, "peakRssMb": peak, "sampleRate": 24000, "model": "hexgrad/Kokoro-82M", "voice": project["voice"], "timingMethod": "Kokoro predicted token durations; not forced alignment"}
(destination / "speech.json").write_text(json.dumps(report), encoding="utf-8")
print(json.dumps({"event": "speech_completed", "seconds": report["synthesisSeconds"], "audioSeconds": sum(x["seconds"] for x in results)}))
