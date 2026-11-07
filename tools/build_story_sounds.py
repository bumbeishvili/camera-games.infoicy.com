"""Prepares the sounds of the games with a mission from their originals, listed in CREDITS.md. Only
needed when changing a sound. Download them into one folder, named as below, and run this with the
same Python as tools/render_voice.py:

    python tools/build_story_sounds.py <folder>
"""
import sys
from pathlib import Path

import numpy as np

from voice_common import ROOT, decode, encode

RATE = 48000
SOURCES = Path(sys.argv[1])


def shaped(audio, level, fade_in=0.004, fade_out=0.05):
    """Sets a sound's peak and softens its edges."""
    audio = audio / max(1e-9, np.abs(audio).max()) * level
    start = int(fade_in * RATE)
    end = int(fade_out * RATE)
    audio[:start] *= np.linspace(0, 1, start)
    audio[-end:] *= np.linspace(1, 0, end)
    return audio


def cut(name, start, end):
    audio = decode(SOURCES / f"{name}.ogg", RATE)
    return audio[int(start * RATE) : int(end * RATE)].copy()


def loudest_moment(name, length, search=None):
    """The part of a recording with the loudest start, as a short sound."""
    audio = decode(SOURCES / f"{name}.ogg", RATE)
    if search:
        audio = audio[int(search[0] * RATE) : int(search[1] * RATE)]
    window = int(0.005 * RATE)
    level = np.sqrt(np.convolve(audio**2, np.ones(window) / window, mode="same"))
    at = int(np.argmax(level))
    begin = at
    while begin > 0 and level[begin] > level[at] * 0.05:
        begin -= 1
    return audio[begin : begin + int(length * RATE)].copy()


def looped(audio, overlap=0.7):
    """A sound that goes round without a join, by fading its end into its start."""
    size = int(overlap * RATE)
    fade = np.linspace(0, 1, size)
    out = audio[:-size].copy()
    out[:size] = out[:size] * fade + audio[-size:] * (1 - fade)
    return out / max(1e-9, np.abs(out).max())


def save(audio, game, name):
    encode(audio, RATE, ROOT / "games" / game / "audio" / name)


save(shaped(loudest_moment("cutting-board-zucchini-1", 0.22), 0.8), "smoothie-stand", "chop.ogg")
save(shaped(cut("electric-hand-mixer-1", 1.5, 3.5), 0.55, fade_in=0.08, fade_out=0.5), "smoothie-stand", "mixer.ogg")
save(shaped(loudest_moment("apple-crunched-1", 0.5), 0.8, fade_out=0.15), "joze-walk", "crunch.ogg")
save(looped(cut("cleaning-glass", 1.5, 5.5), 0.3) * 0.8, "lighthouse", "wipe.ogg")
save(shaped(cut("horn-of-a-ship-1", 0.2, 5.2), 0.5, fade_in=0.2, fade_out=1.5), "lighthouse", "horn.ogg")
save(looped(cut("beach-small-waves", 8, 28)) * 0.7, "lighthouse", "waves.ogg")
print("done")
