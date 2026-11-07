"""Brings recordings of a real person into the game, in place of a generated voice.

Record each line in a lines.json (core/audio/voice/, or a game's audio/voice/) as its own
file, named after its `id`, for example open-right-hand.m4a. A phone's voice memos are fine.
Then:

    python3 tools/import_voice.py <folder of recordings> ka

Each one is trimmed and set to the same level as the rest, so a few takes on different days
still match. Lines you haven't recorded keep their current voice, so this can be done in parts.
"""
import sys
from pathlib import Path

from voice_common import VOICE_DIRS, decode, encode, finish, load_lines

RATE = 48000

folder, language = Path(sys.argv[1]), sys.argv[2]
recordings = {path.stem: path for path in folder.iterdir() if not path.name.startswith(".")}
home = {line["id"]: voice_dir for voice_dir in VOICE_DIRS for line in load_lines(voice_dir)}
known = set(home)

for stem in sorted(set(recordings) - known):
    print(f"ignored {recordings[stem].name}: no line has that id")

imported = 0
for line_id in sorted(known & set(recordings)):
    audio = finish(decode(recordings[line_id], RATE), RATE)
    encode(audio, RATE, home[line_id] / language / f"{line_id}.ogg")
    print(f"{line_id:20} {len(audio) / RATE:5.2f}s")
    imported += 1

missing = sorted(known - set(recordings))
print(f"{imported} imported. {len(missing)} not recorded yet: {', '.join(missing) or 'none'}")
