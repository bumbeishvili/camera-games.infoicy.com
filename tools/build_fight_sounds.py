"""Prepares Mighty Moves' sounds from their originals, listed in CREDITS.md.

Only needed when changing a sound, since the finished files are already in place. Download the
originals into one folder like this, then run it with the same Python as tools/render_voice.py:

    python tools/build_fight_sounds.py <folder>

    swishes/swish-*.wav        hits/hit*.mp3.flac     owlish/djembe*.wav  owlish/hit.wav
    urban_boss_battle.ogg      boxing-bell-1.ogg      shouts-applause-teens.ogg
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
OUT = ROOT / "games" / "mighty-moves" / "audio"
CORE = ROOT / "core" / "audio" / "sfx"
FFMPEG = (Path.home() / ".cache" / "explainer-video" / "ffmpeg-path").read_text().strip()
RATE = 48000


def read(path):
    """Any audio file as mono floats at one sample rate."""
    raw = subprocess.run(
        [FFMPEG, "-hide_banner", "-loglevel", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(RATE), "-"],
        check=True,
        capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype="<f4").copy()


def trim(audio, threshold=0.04, tail=0.0):
    """Drops the quiet before a sound starts, and after it ends."""
    level = np.abs(audio) / max(1e-9, np.abs(audio).max())
    loud = np.nonzero(level > threshold)[0]
    return audio[loud[0] : min(len(audio), loud[-1] + 1 + int(tail * RATE))]


def low_pass(audio, hertz):
    return signal.sosfiltfilt(signal.butter(2, hertz, "lowpass", fs=RATE, output="sos"), audio)


def edges(audio, fade_in=0.002, fade_out=0.03):
    audio = audio.copy()
    n_in, n_out = int(fade_in * RATE), int(fade_out * RATE)
    if n_in:
        audio[:n_in] *= np.linspace(0, 1, n_in)
    if n_out:
        audio[-n_out:] *= np.linspace(1, 0, n_out)
    return audio


def slower(audio, by):
    """Lower and longer, as a tape played slowly."""
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
    print(f"{name:16} {len(audio) / RATE:6.2f}s  {(OUT / name).stat().st_size // 1024} KB")


# Real swings through the air. These are short, so slowing them a little gives them some body.
for number, source in enumerate(["swish-7", "swish-9", "swish-3"], start=1):
    audio = trim(read(SOURCES / "swishes" / f"{source}.wav"), 0.02)
    write(to_peak(edges(slower(audio, 1.25), 0.004, 0.04), -5), f"whoosh-{number}.ogg")

# Real hits, the three with the least harsh top, and softened further. A sharp crack is
# unpleasant over and over, and could startle a sensitive child.
for number, source in enumerate(["hit34", "hit26", "hit33"], start=1):
    audio = trim(read(SOURCES / "hits" / f"{source}.mp3.flac"), 0.06)[: int(0.42 * RATE)]
    write(to_peak(edges(low_pass(audio, 5200), 0.003, 0.09), -4), f"hit-{number}.ogg")

# Hits with weight come from a real hand drum, which is a friendly kind of thump.
drum = trim(read(SOURCES / "owlish" / "djembe2.wav"), 0.02)
write(to_peak(edges(low_pass(slower(drum, 1.35), 3000), 0.002, 0.06), -3), "thump.ogg")
write(to_peak(edges(trim(read(SOURCES / "owlish" / "hit.wav"), 0.03), 0.002, 0.04), -6), "block.ogg")

# The ground shaking: the same drum, slowed right down.
drum = trim(read(SOURCES / "owlish" / "djembe1.wav"), 0.02)
boom = low_pass(slower(drum, 4), 900)
write(to_peak(edges(boom, 0.006, 0.25), -3), "boom.ogg")

# Leaving the ground: the deepest swing, slowed.
audio = trim(read(SOURCES / "swishes" / "swish-8.wav"), 0.02)
write(to_peak(edges(slower(audio, 2.2), 0.01, 0.1), -6), "jump.ogg")

# Three notes from the same glass as the stars, rising.
glass = read(CORE / "star.ogg")
length = len(glass) + int(0.3 * RATE)
sparkle = np.zeros(length)
for step, ratio in enumerate([1, 0.8, 0.667]):
    note = slower(glass, ratio)[: length - int(step * 0.09 * RATE)]
    start = int(step * 0.09 * RATE)
    sparkle[start : start + len(note)] += note * (0.8 + step * 0.1)
write(to_peak(edges(sparkle, 0.001, 0.1), -6), "sparkle.ogg")

# One strike of a real boxing bell.
bell = read(SOURCES / "boxing-bell-1.ogg")
start = int(np.nonzero(np.abs(bell) > np.abs(bell).max() * 0.2)[0][0])
write(to_peak(edges(bell[start : start + int(1.7 * RATE)], 0.002, 0.5), -5), "bell.ogg")

# Real children and teenagers cheering.
cheer = trim(read(SOURCES / "shouts-applause-teens.ogg"), 0.02)
write(to_peak(edges(cheer, 0.05, 1), -4), "cheer.ogg", "80k")

# The music. It's made to loop, and these fades hide the tiny gap a compressed file leaves.
raw = subprocess.run(
    [FFMPEG, "-hide_banner", "-loglevel", "error", "-i", str(SOURCES / "urban_boss_battle.ogg"), "-f", "f32le", "-ac", "2", "-ar", str(RATE), "-"],
    check=True,
    capture_output=True,
).stdout
music = np.frombuffer(raw, dtype="<f4").reshape(-1, 2).copy()
music *= np.minimum(1, np.linspace(0, len(music) / (0.06 * RATE), len(music)))[:, None]
music *= np.minimum(1, np.linspace(len(music) / (0.4 * RATE), 0, len(music)))[:, None]
rms = np.sqrt((music**2).mean())
music *= min(10 ** (-20 / 20) / rms, 0.95 / np.abs(music).max())
write(music, "music.ogg")
