"""Prepares the sound effects from their originals, listed in CREDITS.md.

Only needed when changing a sound, since the finished files are already in place.
Download the originals into one folder under these names, then run it with the same
Python as tools/render_voice.py:

    python tools/build_sounds.py <folder>

    engine-loop-1.wav  start_up.wav  car1.wav  win.wav  applause.ogg  balloon_pop.flac
    kenney/            (the Audio folder from the Kenney Interface Sounds pack)
"""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

SOURCES = Path(sys.argv[1])
ROOT = Path(__file__).resolve().parent.parent
CORE = ROOT / "core" / "audio" / "sfx"
RACERS = ROOT / "games" / "high-five-racers" / "audio"
BALLOONS = ROOT / "games" / "balloon-pop" / "audio"
FFMPEG = (Path.home() / ".cache" / "explainer-video" / "ffmpeg-path").read_text().strip()


def to_peak(audio, decibels):
    return audio * (10 ** (decibels / 20) / np.abs(audio).max())


def fades(audio, rate, fade_in, fade_out):
    audio = audio.copy()
    n_in, n_out = int(fade_in * rate), int(fade_out * rate)
    if n_in:
        audio[:n_in] *= np.linspace(0, 1, n_in)[:, None]
    if n_out:
        audio[-n_out:] *= np.linspace(1, 0, n_out)[:, None]
    return audio


def encode(audio, rate, target):
    """Ogg Opus, for sounds played once. A loop needs FLAC instead: see below."""
    with tempfile.TemporaryDirectory() as folder:
        source = Path(folder) / "sound.wav"
        sf.write(source, audio, rate, subtype="PCM_16")
        subprocess.run(
            [FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
             "-c:a", "libopus", "-b:a", "96k", str(target)],
            check=True,
        )
    print(f"{target.name:20} {len(audio) / rate:5.2f}s")


for folder in (CORE, RACERS, BALLOONS):
    folder.mkdir(parents=True, exist_ok=True)

# The engine. Compressed formats pad the ends of a file, which would click on every loop,
# so this one stays lossless. Resampling through the FFT treats the sound as circular,
# which keeps the join seamless.
audio, rate = sf.read(SOURCES / "engine-loop-1.wav", always_2d=True)
audio = signal.resample(audio, len(audio) // 2, axis=0)
audio -= audio.mean(axis=0)
sf.write(RACERS / "engine-loop.flac", to_peak(audio, -3), rate // 2, subtype="PCM_16")
print(f"engine-loop.flac     {len(audio) / (rate // 2):5.2f}s")

# Cranking and catching, for the start of the countdown. It fades so the idle can take over.
audio, rate = sf.read(SOURCES / "start_up.wav", always_2d=True)
encode(fades(to_peak(audio, -3), rate, 0, 0.35), rate, RACERS / "engine-start.ogg")

# A real car driving past, cut around its loudest moment, for overtaking a rival.
audio, rate = sf.read(SOURCES / "car1.wav", always_2d=True)
window = int(0.1 * rate)
levels = np.sqrt((audio.mean(axis=1)[: len(audio) // window * window].reshape(-1, window) ** 2).mean(axis=1))
loudest = int(levels.argmax()) * window
part = audio[max(0, loudest - int(1.5 * rate)) : loudest + int(1.3 * rate)]
encode(fades(to_peak(part, -3), rate, 0.5, 0.7), rate, RACERS / "pass-by.ogg")

# The finish: a success sound with the silence after it trimmed, and applause that fades.
audio, rate = sf.read(SOURCES / "win.wav", always_2d=True)
levels = np.abs(audio).max(axis=1)
end = int(np.nonzero(levels > levels.max() * 0.003)[0][-1])
encode(fades(to_peak(audio[:end], -3), rate, 0, 0.3), rate, CORE / "win.ogg")

audio, rate = sf.read(SOURCES / "applause.ogg", always_2d=True)
encode(fades(to_peak(audio, -3), rate, 0.05, 2.2), rate, CORE / "applause.ogg")

# A real balloon. Its first instant is sharp enough to startle a sensitive child, so the
# very top is rolled off and the start softened by a few milliseconds.
audio, rate = sf.read(SOURCES / "balloon_pop.flac", always_2d=True)
audio = signal.sosfiltfilt(signal.butter(2, 6500, "lowpass", fs=rate, output="sos"), audio, axis=0)
encode(fades(to_peak(audio, -3), rate, 0.003, 0.08), rate, BALLOONS / "pop.ogg")

# Kenney's sounds are already finished, so these are straight copies.
for target, source in {
    CORE / "star.ogg": "glass_001.ogg",
    CORE / "hands-open.ogg": "confirmation_004.ogg",
    RACERS / "lap.ogg": "confirmation_002.ogg",
    CORE / "go.ogg": "maximize_004.ogg",
    CORE / "tick.ogg": "tick_002.ogg",
}.items():
    shutil.copyfile(SOURCES / "kenney" / source, target)
    print(f"{target.name:20} copied from {source}")
