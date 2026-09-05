import os
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
import torch
from kokoro import KPipeline
torch.set_num_threads(2)
pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M", device="cpu")
next(pipeline("A little light helps a plant grow.", voice="af_heart"))
print("Kokoro model and English voice ready")
