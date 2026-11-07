"""Prepares Leap Trail's sounds from their originals, listed in CREDITS.md.

Only needed when changing a sound, since the finished files are already in place. Download the
originals into one folder like this, then run it with the same Python as tools/render_voice.py:

    python tools/build_trail_sounds.py <folder>

    owlish/grassy-footstep2.wav  owlish/grassy-footstep3.wav  owlish/gassy-footstep1.wav
    owlish/stumble.wav  owlish/djembe2.wav  swishes/swish-8.wav  swishes/swish-3.wav
    HappyClappyLoop.wav
"""
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

SOURCES = Path(sys.argv[1])
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "games" / "leap-trail" / "audio"
FFMPEG = (Path.home() / ".cache" / "explainer-video" / "ffmpeg-path").read_text().strip()
RATE = 48000


def read(path, channels=1):
    raw = subprocess.run(
        [FFMPEG, "-hide_banner", "-loglevel", "error", "-i", str(path), "-f", "f32le", "-ac", str(channels), "-ar", str(RATE), "-"],
        check=True,
        capture_output=True,
    ).stdout
    audio = np.frombuffer(raw, dtype="<f4").copy()
    return audio if channels == 1 else audio.reshape(-1, channels)


def trim(audio, threshold=0.05):
    level = np.abs(audio) / max(1e-9, np.abs(audio).max())
    loud = np.nonzero(level > threshold)[0]
    return audio[loud[0] : loud[-1] + 1]


def low_pass(audio, hertz):
    return signal.sosfiltfilt(signal.butter(2, hertz, "lowpass", fs=RATE, output="sos"), audio)


def edges(audio, fade_in=0.003, fade_out=0.04):
    audio = audio.copy()
    n_in, n_out = int(fade_in * RATE), int(fade_out * RATE)
    if n_in:
        audio[:n_in] *= np.linspace(0, 1, n_in)
    if n_out:
        audio[-n_out:] *= np.linspace(1, 0, n_out)
    return audio


def slower(audio, by):
    return signal.resample(audio, int(len(audio) * by))


def to_peak(audio, decibels):
    return audio * (10 ** (decibels / 20) / np.abs(audio).max())


def write(audio, name, bitrate="96k"):
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as folder:
        source = Path(folder) / "sound.wav"
        sf.write(source, audio, RATE, subtype="PCM_16")
        subprocess.run(
            [FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", str(source), "-c:a", "libopus", "-b:a", bitrate, str(OUT / name)],
            check=True,
        )
    print(f"{name:14} {len(audio) / RATE:6.2f}s  {(OUT / name).stat().st_size // 1024} KB")


# Real footsteps on grass.
for number, source in enumerate(["grassy-footstep2", "grassy-footstep3", "gassy-footstep1"], start=1):
    audio = trim(read(SOURCES / "owlish" / f"{source}.wav"), 0.08)
    write(to_peak(edges(low_pass(audio, 7000), 0.002, 0.05), -6), f"step-{number}.ogg")

# Leaving the ground and sliding along it: real swings through the air, slowed.
write(to_peak(edges(slower(trim(read(SOURCES / "swishes" / "swish-8.wav"), 0.02), 2.2), 0.01, 0.1), -6), "jump.ogg")
write(to_peak(edges(low_pass(slower(trim(read(SOURCES / "swishes" / "swish-3.wav"), 0.02), 3.2), 3500), 0.02, 0.15), -6), "slide.ogg")

# Landing: a real hand drum, softened and slowed.
write(to_peak(edges(low_pass(slower(trim(read(SOURCES / "owlish" / "djembe2.wav"), 0.02), 1.5), 2200), 0.002, 0.06), -5), "land.ogg")

# Running into something: a real stumble.
write(to_peak(edges(low_pass(trim(read(SOURCES / "owlish" / "stumble.wav"), 0.05), 6000), 0.004, 0.1), -4), "bump.ogg")

# The music. It's made to loop, and these fades hide the tiny gap a compressed file leaves.
music = read(SOURCES / "HappyClappyLoop.wav", channels=2)
music *= np.minimum(1, np.linspace(0, len(music) / (0.05 * RATE), len(music)))[:, None]
music *= np.minimum(1, np.linspace(len(music) / (0.25 * RATE), 0, len(music)))[:, None]
rms = np.sqrt((music**2).mean())
music *= min(10 ** (-20 / 20) / rms, 0.95 / np.abs(music).max())
write(music, "music.ogg")
