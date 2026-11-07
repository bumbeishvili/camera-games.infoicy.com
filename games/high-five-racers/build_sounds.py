"""Prepares the high five and the rush of a boost from real recordings, listed in CREDITS.md. Only needed
when changing a sound. Run it with the same Python as tools/render_voice.py, giving it the originals:

    python games/high-five-racers/build_sounds.py <palmas.ogg> <car1.wav>

A high five is lower and fuller than a clap, so this slows one real clap down and puts a real hand
drum under it, softens the very top, and sets the level. The rush is the moment a real car comes past.
"""
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

RATE = 48000
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
FFMPEG = (Path.home() / ".cache" / "explainer-video" / "ffmpeg-path").read_text().strip()


def decode(path):
    with tempfile.TemporaryDirectory() as folder:
        target = Path(folder) / "sound.wav"
        subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", str(path), "-ac", "1", "-ar", str(RATE), str(target)], check=True)
        audio, _ = sf.read(target, dtype="float32")
    return audio


def encode(audio, target):
    with tempfile.TemporaryDirectory() as folder:
        source = Path(folder) / "sound.wav"
        sf.write(source, audio, RATE, subtype="PCM_16")
        subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", str(source), "-c:a", "libopus", "-b:a", "96k", str(target)], check=True)


def typical_clap(audio):
    """A clap from the middle of the recording, and not the loudest, so it isn't an odd one."""
    window = int(0.005 * RATE)
    level = np.sqrt(np.convolve(audio**2, np.ones(window) / window, mode="same"))
    middle = level[10 * RATE : 60 * RATE]
    peaks = np.nonzero(middle > np.percentile(middle, 99.5))[0]
    at = 10 * RATE + int(peaks[len(peaks) // 2])
    begin = at
    while begin > 0 and level[begin] > level[at] * 0.08:
        begin -= 1
    return audio[begin : begin + int(0.22 * RATE)]


def slowed(audio, amount):
    return signal.resample(audio, int(len(audio) / amount))


def starts_at_peak(audio):
    """Cuts anything before the attack, so that layers land together."""
    return audio[max(0, int(np.argmax(np.abs(audio))) - int(0.002 * RATE)) :]


palmas = decode(Path(sys.argv[1]))
clap = starts_at_peak(slowed(typical_clap(palmas), 0.8))
drum = starts_at_peak(decode(ROOT / "games" / "mighty-moves" / "audio" / "thump.ogg"))

length = max(len(clap), len(drum))
slap = np.zeros(length, dtype=np.float64)
slap[: len(clap)] += clap / max(1e-9, np.abs(clap).max())
slap[: len(drum)] += 0.55 * drum / max(1e-9, np.abs(drum).max())

# Anything above 7 kHz only makes it sharper, and this is for a sensitive child's ears.
sos = signal.butter(2, 7000, "low", fs=RATE, output="sos")
slap = signal.sosfilt(sos, slap)
slap = slap / np.abs(slap).max() * 0.8
fade_in = int(0.002 * RATE)
fade_out = int(0.06 * RATE)
slap[:fade_in] *= np.linspace(0, 1, fade_in)
slap[-fade_out:] *= np.linspace(1, 0, fade_out)
encode(slap.astype(np.float32), HERE / "audio" / "slap.ogg")

rms = float(np.sqrt(np.mean(slap[: int(0.1 * RATE)] ** 2)))
print(f"slap.ogg {length / RATE:.2f}s peak {np.abs(slap).max():.2f} rms-100ms {rms:.3f}")

# The car getting louder and brighter as it comes, without the moment it's level and going away.
car = decode(Path(sys.argv[2]))
rush = car[int(7.0 * RATE) : int(8.3 * RATE)].astype(np.float64)
sos = signal.butter(2, 5000, "low", fs=RATE, output="sos")
rush = signal.sosfilt(sos, rush)
rush = rush / np.abs(rush).max() * 0.6
fade_in = int(0.18 * RATE)
fade_out = int(0.5 * RATE)
rush[:fade_in] *= np.linspace(0, 1, fade_in)
rush[-fade_out:] *= np.linspace(1, 0, fade_out) ** 2
encode(rush.astype(np.float32), HERE / "audio" / "rush.ogg")
print(f"rush.ogg {len(rush) / RATE:.2f}s peak {np.abs(rush).max():.2f}")
