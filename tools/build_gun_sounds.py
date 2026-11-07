"""Prepares the guns in Sky Wings from a recording of paintball shots, listed in CREDITS.md, which is
softer and friendlier than real guns. Only needed when changing a sound. Run it with the same Python as
tools/render_voice.py:

    python tools/build_gun_sounds.py <paintball shots>
"""
import sys
from pathlib import Path

import numpy as np

from voice_common import ROOT, decode, encode

RATE = 48000
SHOT_SECONDS = 0.075
SHOTS_IN_LOOP = 12
SHOT_EVERY = 0.11
OUT = ROOT / "games" / "sky-wings" / "audio"

audio = decode(Path(sys.argv[1]), RATE)
window = int(0.004 * RATE)
level = np.sqrt(np.convolve(audio**2, np.ones(window) / window, mode="same"))


def find_shots():
    """The shots in the recording: each place that gets loud, once it has gone quiet again."""
    shots = []
    threshold = level.max() * 0.3
    at = 0
    while at < len(audio) - int(SHOT_SECONDS * RATE):
        if level[at] > threshold:
            start = at
            while start > 0 and level[start] > threshold * 0.1:
                start -= 1
            shots.append(audio[start : start + int(SHOT_SECONDS * RATE)].copy())
            at += int(0.12 * RATE)
        at += 1
    return shots


def softened(shot):
    fade = int(0.003 * RATE)
    shot[:fade] *= np.linspace(0, 1, fade)
    tail = int(0.03 * RATE)
    shot[-tail:] *= np.linspace(1, 0, tail)
    return shot / max(1e-9, np.abs(shot).max())


def at_rate(shot, rate):
    """Slower or quicker, and lower or higher with it, as with playing a tape at another speed."""
    positions = np.arange(0, len(shot) - 1, rate)
    return np.interp(positions, np.arange(len(shot)), shot)


shots = [softened(shot) for shot in find_shots()]
print(f"found {len(shots)} shots")
encode(shots[0] * 0.9, RATE, OUT / "gun-pop.ogg")

# A steady rattle that goes round without a join, as nothing runs past the end of it. No two shots are
# quite the same, so it doesn't sound like one sound repeated.
random = np.random.default_rng(7)
loop = np.zeros(int(SHOTS_IN_LOOP * SHOT_EVERY * RATE))
for index in range(SHOTS_IN_LOOP):
    shot = at_rate(shots[index % len(shots)], random.uniform(0.9, 1.12)) * random.uniform(0.72, 1)
    start = int(index * SHOT_EVERY * RATE)
    end = min(len(loop), start + len(shot))
    loop[start:end] += shot[: end - start]
encode(loop / max(1e-9, np.abs(loop).max()) * 0.85, RATE, OUT / "guns.ogg")
