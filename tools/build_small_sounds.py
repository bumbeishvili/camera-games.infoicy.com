"""Prepares the clap in Mighty Moves, the sizzle in Balloon Pop and the propeller in Sky Wings from
their originals, listed in CREDITS.md. Only needed when changing a sound. Run it with the same Python
as tools/render_voice.py:

    python tools/build_small_sounds.py <palmas.ogg> <fried-egg.ogg> <small-airplane.ogg>
"""
import sys
from pathlib import Path

import numpy as np

from voice_common import ROOT, decode, encode

RATE = 48000


def shaped(audio, level, fade_in=0.002, fade_out=0.05):
    """Sets a sound's peak and softens its edges."""
    audio = audio / max(1e-9, np.abs(audio).max()) * level
    start = int(fade_in * RATE)
    end = int(fade_out * RATE)
    audio[:start] *= np.linspace(0, 1, start)
    audio[-end:] *= np.linspace(1, 0, end)
    return audio


def loudest_clap(audio):
    """One clap, from the middle of the recording: it starts at a sudden rise in level."""
    window = int(0.005 * RATE)
    level = np.sqrt(np.convolve(audio**2, np.ones(window) / window, mode="same"))
    middle = level[10 * RATE : 60 * RATE]
    # A typical clap rather than the very loudest, so it's not an odd one out.
    peaks = np.nonzero(middle > np.percentile(middle, 99.5))[0]
    at = 10 * RATE + int(peaks[len(peaks) // 2])
    begin = at
    while begin > 0 and level[begin] > level[at] * 0.08:
        begin -= 1
    return audio[begin : begin + int(0.2 * RATE)]


palmas = decode(Path(sys.argv[1]), RATE)
encode(shaped(loudest_clap(palmas).copy(), 0.8), RATE, ROOT / "games" / "mighty-moves" / "audio" / "clap.ogg")

egg = decode(Path(sys.argv[2]), RATE)
# The egg going into the pan, and the first of the sizzling.
encode(shaped(egg[int(6.85 * RATE) : int(8.2 * RATE)].copy(), 0.7, fade_out=0.4), RATE, ROOT / "games" / "balloon-pop" / "audio" / "sizzle.ogg")
# The steady first part of a small plane going over. It loops by fading its end into its start.
plane = decode(Path(sys.argv[3]), RATE)[int(0.2 * RATE) : int(6.4 * RATE)].copy()
overlap = int(0.7 * RATE)
fade = np.linspace(0, 1, overlap)
looped = plane[:-overlap].copy()
looped[:overlap] = looped[:overlap] * fade + plane[-overlap:] * (1 - fade)
looped = looped / max(1e-9, np.abs(looped).max()) * 0.8
encode(looped, RATE, ROOT / "games" / "sky-wings" / "audio" / "propeller.ogg")
print("done")
