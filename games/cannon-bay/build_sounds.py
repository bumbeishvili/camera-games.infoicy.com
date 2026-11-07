"""Prepares the sounds of Cannon Bay from real recordings, listed in CREDITS.md. Only needed when changing
a sound. Download the originals into one folder, each named by its number on BigSoundBank (1806.ogg), and
the music as chant.ogg, and run this with the same Python as tools/render_voice.py:

    python games/cannon-bay/build_sounds.py <folder>

The cannon is a real gun that scares birds off fields, recorded from 250 metres away, then slowed and
softened until it's more of a friendly thump than a bang, as this is for a sensitive child's ears.
"""
import sys
from pathlib import Path

import numpy as np
from scipy import signal

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent / "tools"))

from voice_common import decode, encode  # noqa: E402

RATE = 48000
SOURCES = Path(sys.argv[1])
OUT = HERE / "audio"


def load(name, start=0.0, end=None):
    audio = decode(SOURCES / f"{name}.ogg", RATE).astype(np.float64)
    return audio[int(start * RATE) : None if end is None else int(end * RATE)]


def low_pass(audio, hertz):
    return signal.sosfilt(signal.butter(2, hertz, "low", fs=RATE, output="sos"), audio)


def slowed(audio, amount):
    """Slower and lower together, as with playing a tape at another speed."""
    return signal.resample(audio, int(len(audio) / amount))


def shaped(audio, level, fade_in=0.004, fade_out=0.05):
    """Sets a sound's peak and softens its edges."""
    audio = audio / max(1e-9, np.abs(audio).max()) * level
    start = int(fade_in * RATE)
    end = int(fade_out * RATE)
    audio[:start] *= np.linspace(0, 1, start)
    audio[-end:] *= np.linspace(1, 0, end) ** 2
    return audio


def looped(audio, overlap=0.8, level=0.7):
    """A sound that goes round without a join, by fading its end into its start."""
    size = int(overlap * RATE)
    fade = np.linspace(0, 1, size)
    out = audio[:-size].copy()
    out[:size] = out[:size] * fade + audio[-size:] * (1 - fade)
    return out / max(1e-9, np.abs(out).max()) * level


def save(audio, name):
    encode(audio.astype(np.float32), RATE, OUT / name)
    loud = float(np.sqrt(np.mean(audio[: int(0.3 * RATE)] ** 2)))
    print(f"{name:14} {len(audio) / RATE:6.2f}s  peak {np.abs(audio).max():.2f}  rms of the first 0.3s {loud:.3f}")


# A thump of a cannon: the far-off gun, slowed and with its top taken off, and a slow start to it.
save(shaped(low_pass(slowed(load("1806"), 0.72), 2400), 0.72, fade_in=0.012, fade_out=0.3), "cannon.ogg")
# A big stone going into water, for a cannonball landing in the sea.
save(shaped(low_pass(load("1521", 0.2, 2.0), 9000), 0.7, fade_in=0.006, fade_out=0.6), "splash.ogg")
# A wooden gavel, slowed, for a ball hitting a wooden ship.
save(shaped(low_pass(slowed(load("1588"), 0.72), 4500), 0.72, fade_in=0.002, fade_out=0.08), "thud.ogg")
# A big rope creaking under load, as rigging does.
save(looped(load("3426", 2, 26), 0.9, 0.7), "creak.ogg")
# Wind whistling through the masts of real boats.
save(looped(load("2444", 8, 34), 1.2, 0.7), "wind.ogg")
# A flag being shaken, slowed to sound like a big sail filling.
save(shaped(low_pass(slowed(load("1787", 0.5), 0.68), 7000), 0.7, fade_in=0.01, fade_out=0.25), "canvas.ogg")
# Gulls over a real fishing harbour.
save(looped(load("2573", 0, 24), 1, 0.7), "gulls.ogg")
# One stroke of a real oar, for the crew rowing away.
save(shaped(load("1513", 0.25, 1.7), 0.55, fade_in=0.05, fade_out=0.4), "row.ogg")
# The sea shanty, which is written to go round already, and only needs its join hiding.
save(looped(load("chant"), 0.5, 0.75), "music.ogg")
