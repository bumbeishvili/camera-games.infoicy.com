"""Renders the English lines with Kokoro, on this computer.

Lines are in the lines.json next to each voice folder, in core/ and in any game with its own.
`text` is what the game asks for and `speak` is what Kokoro reads when that needs spelling
differently. `voice` picks another Kokoro voice for that line. The game only plays the finished
files, so nothing here is needed to run it. Run this after changing a line:

    npm run voice               (or: npm run voice -- af_bella, for another main voice)

Uses the Kokoro install set up by the explainer-video skill, in ~/.cache/explainer-video.
Kokoro has no Georgian: see render_voice_ka.py for that.
"""
import os
import sys
from pathlib import Path

HOME = Path.home() / ".cache" / "explainer-video"
os.environ.setdefault("HF_HOME", str(HOME / "hf"))
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")

import numpy as np  # noqa: E402

# espeak-ng truncates long data paths, and misaki sets a long one when imported, so it has
# to be replaced with the short copy before the model loads.
import misaki.espeak  # noqa: E402,F401
from phonemizer.backend.espeak.wrapper import EspeakWrapper  # noqa: E402

EspeakWrapper.set_data_path(str(HOME / "espeak-ng-data"))

from mlx_audio.tts.utils import load_model  # noqa: E402

from voice_common import ROOT, VOICE_DIRS, encode, finish, load_lines, remove_stale  # noqa: E402

MODEL = "mlx-community/Kokoro-82M-bf16"
MAIN_VOICE = sys.argv[1] if len(sys.argv) > 1 else "af_heart"
# A little slower than conversation, for young listeners.
SPEED = 0.94
SAMPLE_RATE = 24000

model = load_model(model_path=MODEL)
pipelines = {}


def pipeline_for(voice):
    # The first letter of a voice's name says which accent it reads with.
    return pipelines.setdefault(voice[0], model._get_pipeline(voice[0]))


for folder in VOICE_DIRS:
    lines = load_lines(folder)
    out = folder / "en"
    for line in lines:
        spoken = line.get("speak", line["text"])
        voice = line.get("voice", MAIN_VOICE)
        parts = [np.array(chunk.audio, dtype=np.float32).reshape(-1) for chunk in pipeline_for(voice)(spoken, voice=voice, speed=SPEED)]
        audio = finish(np.concatenate(parts), SAMPLE_RATE)
        encode(audio, SAMPLE_RATE, out / f"{line['id']}.ogg")
        print(f"{line['id']:20} {voice:10} {len(audio) / SAMPLE_RATE:5.2f}s  {spoken}")
    remove_stale(out, lines)
    print(f"{len(lines)} lines rendered in {folder.relative_to(ROOT)}")
