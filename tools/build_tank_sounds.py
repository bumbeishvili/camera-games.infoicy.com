"""Prepares Tank Patrol's sounds from their originals, listed in CREDITS.md. Only needed when changing a
sound. Download each one as Ogg from BigSoundBank, named by its sound number such as 0967.ogg, into one
folder or folders under it, and run this with the same Python as tools/render_voice.py:

    python -I tools/build_tank_sounds.py <folder>

The gun is big but soft and friendly: a champagne cork, slowed down, on top of a far-off bird scarer with
everything sharp taken out of it. Nothing here has a sharp edge, as there are a lot of shots.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np  # noqa: E402
from scipy import signal  # noqa: E402

from voice_common import ROOT, decode, encode  # noqa: E402

RATE = 48000
SOURCES = Path(sys.argv[1])
OUT = ROOT / "games" / "tank-patrol" / "audio"


def recording(number):
    return decode(next(SOURCES.rglob(f"{number}.ogg")), RATE)


def low_pass(audio, hertz):
    """Softens the sharpest part of a sound, so it doesn't startle or tire anyone."""
    return signal.sosfiltfilt(signal.butter(2, hertz, "lowpass", fs=RATE, output="sos"), audio)


def cut(audio, start, length):
    return audio[int(start * RATE) : int((start + length) * RATE)].copy()


def from_the_start(audio, length):
    """A sound from the moment it starts, and however long is wanted after that."""
    window = int(0.003 * RATE)
    level = np.sqrt(np.convolve(audio**2, np.ones(window) / window, mode="same"))
    begin = int(np.argmax(level > level.max() * 0.08))
    return audio[max(0, begin - int(0.002 * RATE)) : begin + int(length * RATE)].copy()


def at_rate(audio, rate):
    """Slower or quicker, and lower or higher with it, as with playing a tape at another speed."""
    return np.interp(np.arange(0, len(audio) - 1, rate), np.arange(len(audio)), audio)


def shaped(audio, level, fade_in=0.003, fade_out=0.05):
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


def dying_away(audio, seconds):
    """Fades over the whole of a sound, faster at first, as a bang does outdoors."""
    return audio * np.exp(-np.arange(len(audio)) / (seconds * RATE))


def save(audio, name):
    encode(audio, RATE, OUT / name)
    spectrum = np.abs(np.fft.rfft(audio * np.hanning(len(audio))))
    middle = (spectrum * np.fft.rfftfreq(len(audio), 1 / RATE)).sum() / max(1e-9, spectrum.sum())
    print(f"{name:14} {len(audio) / RATE:5.2f}s  peak {np.abs(audio).max():.2f}  brightness {middle:5.0f} Hz")


# The engine: a big diesel ticking over, which chugs about eight times a second. A loop of it follows how
# fast the tank is going, by playing it faster and louder.
save(looped(low_pass(cut(recording("0967"), 8, 6.8), 2400), 0.8) * 0.8, "engine.ogg")

# The gun. A champagne cork for the pop, an octave or so down, and a far-off bird scarer for the boom.
far_gun = recording("1023")
near_gun = recording("1806")
save(shaped(layered(
    (low_pass(at_rate(from_the_start(recording("0211"), 0.34), 0.62), 2600), 0.55, 0),
    (dying_away(low_pass(from_the_start(far_gun, 0.85), 620), 0.3), 0.85, 0.002),
), 0.72, fade_out=0.28), "shot-1.ogg")
save(shaped(layered(
    (low_pass(at_rate(from_the_start(recording("0648"), 0.3), 0.56), 2400), 0.55, 0),
    (dying_away(low_pass(from_the_start(near_gun, 0.68), 560), 0.26), 0.85, 0.002),
), 0.72, fade_out=0.25), "shot-2.ogg")

# Shots landing on a robot tank: real paintballs on real metal drums, a little lower.
drums = recording("0530")
for index, start in enumerate([6.70, 8.32, 11.93], 1):
    save(shaped(low_pass(at_rate(cut(drums, start, 0.24), 0.86), 5200), 0.5, fade_out=0.09), f"hit-{index}.ogg")

# A robot tank's slow lob: a tin can, a long way down, with a far-off thump in it.
tin = recording("0249")
save(shaped(layered(
    (low_pass(at_rate(from_the_start(tin, 0.34), 0.5), 1800), 0.6, 0),
    (dying_away(low_pass(from_the_start(near_gun, 0.5), 380), 0.14), 0.5, 0),
), 0.55, fade_out=0.16), "lob.ogg")

# A shell coming down: the same bird scarer, very soft, with a bit of tin in it for something to hit.
save(shaped(layered(
    (dying_away(low_pass(from_the_start(far_gun, 0.8), 420), 0.24), 0.9, 0),
    (low_pass(at_rate(from_the_start(recording("0247"), 0.3), 0.72), 2400), 0.26, 0.02),
), 0.68, fade_out=0.25), "land.ogg")

# A robot tank rattling to a halt: a ratchet noisemaker slowing down, and tin cans and a nail on the ground.
ratchet = low_pass(cut(recording("0318"), 3, 1.25), 5000)
ratchet *= np.linspace(1, 0.15, len(ratchet)) ** 1.5
nail = recording("0461")
save(shaped(layered(
    (ratchet, 0.55, 0),
    (low_pass(from_the_start(recording("0247"), 0.7), 6500), 0.6, 0.72),
    (low_pass(cut(nail, 19.15, 0.8), 7000), 0.22, 0.9),
), 0.66, fade_out=0.25), "rattle.ogg")

# Its engine giving up: the very end of a car with a damaged muffler being switched off.
save(shaped(low_pass(cut(recording("0673"), 6.9, 1.5), 2400), 0.55, fade_in=0.1, fade_out=0.5), "splutter.ogg")

# Its crew hopping down: a harp doing a cartoon bounce.
save(shaped(low_pass(cut(recording("2284"), 0.0, 0.75), 5000), 0.5, fade_out=0.3), "hop.ogg")

# The valley: birds singing in the countryside.
save(looped(cut(recording("0898"), 34, 17.4), 1.4) * 0.7, "birds.ogg")
print("done")
