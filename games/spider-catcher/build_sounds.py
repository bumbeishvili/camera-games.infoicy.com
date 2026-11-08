"""Prepares the sounds of Spider Catcher from real recordings, listed in CREDITS.md. Only needed when
changing a sound. Download the originals from BigSoundBank into one folder, each named by its number
(2278.mp3 is at https://bigsoundbank.com/UPLOAD/mp3/2278.mp3), and run this with the same Python as
tools/render_voice.py:

    python games/spider-catcher/build_sounds.py <folder>

A spider going home is a real harp playing a cartoon bounce, softened, as it lands in its web. A spider
that's let go scurries off through real long grass. Under it all is a real wood full of birds, quiet.
"""
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent / "tools"))

from voice_common import decode, encode  # noqa: E402

RATE = 48000
SOURCES = Path(sys.argv[1])
OUT = HERE / "audio"


def load(name, start=0.0, end=None):
    audio = decode(SOURCES / f"{name}.mp3", RATE).astype(np.float64)
    return audio[int(start * RATE) : None if end is None else int(end * RATE)]


def shaped(audio, level, fade_in=0.004, fade_out=0.05):
    """Sets a sound's peak and softens its edges."""
    audio = audio / max(1e-9, np.abs(audio).max()) * level
    start = int(fade_in * RATE)
    end = int(fade_out * RATE)
    audio[:start] *= np.linspace(0, 1, start)
    audio[-end:] *= np.linspace(1, 0, end)
    return audio


def from_onset(audio, length):
    """From just before the sound starts, for this long."""
    window = int(0.005 * RATE)
    level = np.sqrt(np.convolve(audio**2, np.ones(window) / window, mode="same"))
    begin = int(np.argmax(level > level.max() * 0.05))
    return audio[max(0, begin - int(0.003 * RATE)) : begin + int(length * RATE)].copy()


def looped(audio, overlap=1.0):
    """A sound that goes round without a join, by fading its end into its start."""
    size = int(overlap * RATE)
    fade = np.linspace(0, 1, size)
    out = audio[:-size].copy()
    out[:size] = out[:size] * fade + audio[-size:] * (1 - fade)
    return out


def save(audio, name):
    encode(audio.astype(np.float32), RATE, OUT / name)
    print(name, f"{len(audio) / RATE:.2f}s", f"peak {np.abs(audio).max():.2f}")


# A harp's cartoon bounce: the spider landing in its web.
save(shaped(from_onset(load("2278"), 1.5), 0.6, fade_out=0.6), "home.ogg")
# Maiden silvergrass rustling: a spider scurrying off, or coming in.
save(shaped(load("1813", 0.0, 1.3), 0.45, fade_in=0.05, fade_out=0.5), "rustle.ogg")
# A calm wood full of birds, from its quietest part, set low so it stays underneath.
birds = looped(load("0100", 0.5, 25.5))
save(birds / np.abs(birds).max() * 0.5, "birds.ogg")
