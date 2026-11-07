"""Prepares Robot Rescue's sounds from their originals, listed in CREDITS.md. Only needed when changing
a sound. Download each one as Ogg from BigSoundBank, named by its sound number such as 0528.ogg, into
one folder or folders under it, and run this with the same Python as tools/render_voice.py:

    python -I tools/build_rescue_sounds.py <folder>
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np  # noqa: E402
from scipy import signal  # noqa: E402

from voice_common import ROOT, decode, encode  # noqa: E402

RATE = 48000
SOURCES = Path(sys.argv[1])
OUT = ROOT / "games" / "robot-rescue" / "audio"


def recording(number):
    return decode(next(SOURCES.rglob(f"{number}.ogg")), RATE)


def low_pass(audio, hertz):
    """Softens the sharpest part of a sound, so it doesn't startle or tire anyone."""
    return signal.sosfiltfilt(signal.butter(2, hertz, "lowpass", fs=RATE, output="sos"), audio)


def cut(audio, start, length):
    return audio[int(start * RATE) : int((start + length) * RATE)].copy()


def shaped(audio, level, fade_in=0.002, fade_out=0.05):
    """Sets a sound's peak and softens its edges."""
    audio = audio / max(1e-9, np.abs(audio).max()) * level
    start = int(fade_in * RATE)
    end = int(fade_out * RATE)
    if start:
        audio[:start] *= np.linspace(0, 1, start)
    audio[-end:] *= np.linspace(1, 0, end)
    return audio


def layered(*parts):
    """Sounds on top of each other, each given as (audio, level, seconds later)."""
    length = max(len(audio) + int(later * RATE) for audio, _, later in parts)
    out = np.zeros(length, dtype=np.float32)
    for audio, level, later in parts:
        at = int(later * RATE)
        out[at : at + len(audio)] += audio / max(1e-9, np.abs(audio).max()) * level
    return out


def looped(audio, overlap):
    """A sound that goes round without a join, by fading its end into its start."""
    size = int(overlap * RATE)
    fade = np.linspace(0, 1, size)
    out = audio[:-size].copy()
    out[:size] = out[:size] * fade + audio[-size:] * (1 - fade)
    return out / max(1e-9, np.abs(out).max())


def save(audio, name):
    encode(audio, RATE, OUT / name)
    print(f"{name:18} {len(audio) / RATE:5.2f}s  peak {np.abs(audio).max():.2f}")


# Real paintball shots, each one on its own and softened, as there are a lot of them.
paintball = recording("0528")
for index, start in enumerate([1.03, 1.57, 1.84], 1):
    save(shaped(low_pass(cut(paintball, start, 0.17), 6500), 0.55, fade_out=0.06), f"shot-{index}.ogg")

# The same paintballs landing on metal drums, which is what hitting a tin robot sounds like.
drums = recording("0530")
for index, start in enumerate([6.70, 8.32, 11.93], 1):
    save(shaped(low_pass(cut(drums, start, 0.24), 6000), 0.5, fade_out=0.09), f"hit-{index}.ogg")

# A robot in pieces: a tin can hitting the ground, and a nail bouncing away on tiles.
nail = recording("0461")
save(shaped(low_pass(layered(
    (cut(recording("0248"), 0, 1.1), 0.75, 0),
    (cut(nail, 19.15, 1.05), 0.4, 0.05),
), 5000), 0.75, fade_out=0.25), "clatter-1.ogg")
save(shaped(low_pass(layered(
    (cut(recording("0667"), 14.16, 1.1), 0.75, 0),
    (cut(nail, 15.56, 0.8), 0.4, 0.1),
), 5000), 0.75, fade_out=0.25), "clatter-2.ogg")

# The big one coming down: steel bars falling, with tins and nails going everywhere.
save(shaped(low_pass(layered(
    (cut(recording("1776"), 0.04, 2.6), 0.85, 0),
    (cut(recording("0667"), 42.55, 1.2), 0.5, 0.18),
    (cut(nail, 9.25, 1.1), 0.3, 0.4),
    (cut(nail, 0.74, 1.0), 0.28, 0.75),
), 4200), 0.8, fade_out=0.8), "crash.ogg")

# Goo, from mud and a squeezed sponge.
mud = recording("0495")
save(shaped(low_pass(cut(recording("0778"), 0.62, 0.32), 5000), 0.55, fade_out=0.1), "goo-throw.ogg")
save(shaped(low_pass(cut(mud, 7.84, 0.42), 6000), 0.65, fade_out=0.15), "goo-splat.ogg")
# Bubbles burst by mouth, for goo shot out of the air.
save(shaped(cut(recording("1074"), 19.23, 0.26), 0.6, fade_out=0.08), "goo-pop.ogg")
# Goo hitting the shield: an aluminium lid, softened, and a little mud.
save(shaped(layered(
    (low_pass(cut(recording("0379"), 0, 0.5), 3500), 0.6, 0),
    (low_pass(cut(mud, 6.52, 0.3), 6000), 0.5, 0.01),
), 0.6, fade_out=0.2), "shield-hit.ogg")

save(shaped(low_pass(cut(recording("1506"), 0.8, 0.34), 6000), 0.65, fade_out=0.1), "reload.ogg")
save(shaped(cut(recording("2003"), 0.06, 0.3), 0.5, fade_out=0.1), "empty.ogg")
save(shaped(cut(recording("1539"), 1.56, 1.2), 0.65, fade_out=0.25), "unlock.ogg")
save(shaped(low_pass(cut(recording("2284"), 0.0, 0.75), 5000), 0.5, fade_out=0.3), "boing.ogg")
save(shaped(low_pass(cut(recording("1102"), 0.1, 1.5), 6000), 0.5, fade_out=0.6), "bell.ogg")

# Going along: a Lego train, as the tram's a toy too, and gulls for by the water.
save(looped(cut(recording("1606"), 9, 11.7), 0.7) * 0.7, "tram.ogg")
save(looped(cut(recording("2573"), 19, 21), 1.0) * 0.7, "gulls.ogg")
print("done")
