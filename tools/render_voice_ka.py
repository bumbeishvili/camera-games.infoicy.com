"""Renders the Georgian lines with Microsoft's neural voices, through the edge-tts tool.

Kokoro has no Georgian. These are the most natural Georgian voices that can be generated
without a recording session or an account: see CREDITS.md for how they were chosen, and for the
terms to check before publishing the games. A line's `ka` is what gets said. `kaVoice`, `kaPitch`
(in hertz) and `kaRate` change how, so the fighters don't all sound alike. This sends only the
text of the lines over the internet, and nothing about a child. To re-render:

    python3 -m venv venv && venv/bin/pip install edge-tts numpy
    venv/bin/python tools/render_voice_ka.py

The game only plays the finished files, so none of this is needed to play.
"""
import asyncio
import tempfile
from pathlib import Path

import edge_tts

from voice_common import ROOT, VOICE_DIRS, decode, encode, finish, load_lines, remove_stale

MAIN_VOICE = "ka-GE-EkaNeural"
# A little slower than conversation, for young listeners.
MAIN_RATE = "-4%"
SAMPLE_RATE = 48000
AT_ONCE = 3
ATTEMPTS = 5


async def fetch(line, target):
    """A dropped connection shouldn't lose a line, so this tries again."""
    pitch = line.get("kaPitch", 0)
    communicate = edge_tts.Communicate(
        line["ka"],
        line.get("kaVoice", MAIN_VOICE),
        rate=line.get("kaRate", MAIN_RATE),
        pitch=f"{'+' if pitch >= 0 else ''}{pitch}Hz",
    )
    await communicate.save(str(target))


async def render(line, out, limit, folder):
    async with limit:
        raw = Path(folder) / f"{line['id']}.mp3"
        for attempt in range(1, ATTEMPTS + 1):
            try:
                await fetch(line, raw)
                break
            except Exception as error:  # The service can refuse or drop any one request.
                if attempt == ATTEMPTS:
                    raise
                print(f"trying {line['id']} again: {error}")
                await asyncio.sleep(2 * attempt)
        audio = finish(decode(raw, SAMPLE_RATE), SAMPLE_RATE)
        encode(audio, SAMPLE_RATE, out / f"{line['id']}.ogg")
        print(f"{line['id']:20} {len(audio) / SAMPLE_RATE:5.2f}s  {line['ka']}")


async def main():
    limit = asyncio.Semaphore(AT_ONCE)
    with tempfile.TemporaryDirectory() as folder:
        for voice_dir in VOICE_DIRS:
            lines = load_lines(voice_dir)
            out = voice_dir / "ka"
            await asyncio.gather(*(render(line, out, limit, folder) for line in lines))
            remove_stale(out, lines)
            print(f"{len(lines)} lines rendered in {voice_dir.relative_to(ROOT)}")


asyncio.run(main())
