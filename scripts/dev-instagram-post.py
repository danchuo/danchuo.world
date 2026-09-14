#!/usr/bin/env python3
"""Put a sample Instagram post into the local stack (PRD 5.17, instagram slice).

The real post reaches the board over OAuth: the owner authorises the app, a 60-day token lands
in the database, and a poller pulls the latest media every half hour. None of that can happen
on a developer machine - the redirect URI is https-only and points at production - so the card
under the Instagram mark stays invisible locally and the only place to look at it is the live
site. That is a bad place to iterate on a hover card.

This script seeds the two things the endpoint actually reads: the singleton row in
`instagram_post` and the two image files the storage serves (`post.img`, `avatar.img`). What it
does NOT fake is the path - there is no pretend token and no pretend API. The board then shows
the card exactly as production does, because from `GET /api/instagram/latest` down it IS the
production code.

    python scripts/dev-instagram-post.py
    python scripts/dev-instagram-post.py --comments 1 --likes 0 --age-hours 3
    python scripts/dev-instagram-post.py --clear

The defaults cover the ordinary case. The flags exist for the states that differ on screen:
counts hidden by the owner (`--likes none`), a single comment versus many (Russian declension),
a post minutes old versus days old, and an empty caption.
"""

from __future__ import annotations

import argparse
import struct
import subprocess
import sys
import tempfile
import zlib
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
# The storage lives inside the film volume (see InstagramImageStorage): one mounted volume for
# both, because production already mounts that one and a second would be a step in the deploy.
REMOTE_DIR = "/data/film/instagram"

CAPTION = (
    "Плёнка с прошлой недели: набережная, ветер и ни одного кадра в фокусе. "
    "Проявка своя, сканы свои, ошибки тоже свои."
)


def png(width: int, height: int, left: tuple[int, int, int], right: tuple[int, int, int]) -> bytes:
    """A square frame as a horizontal gradient, written by hand to keep the script dependency
    free. Horizontal on purpose: the card draws the frame edge to edge, so a stray inset shows
    up as a pale strip against a saturated left or right column."""
    rows = bytearray()
    row = bytearray()
    for x in range(width):
        t = x / max(1, width - 1)
        row.extend(round(left[i] + (right[i] - left[i]) * t) for i in range(3))
    for _ in range(height):
        rows.append(0)  # filter type: none
        rows.extend(row)

    def chunk(tag: bytes, payload: bytes) -> bytes:
        return (
            struct.pack(">I", len(payload))
            + tag
            + payload
            + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)
        )

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(rows), 9))
        + chunk(b"IEND", b"")
    )


def compose(*args: str, stdin: bytes | None = None) -> subprocess.CompletedProcess[bytes]:
    done = subprocess.run(
        ["docker", "compose", *args],
        cwd=REPO,
        input=stdin,
        capture_output=True,
    )
    if done.returncode != 0:
        sys.exit(f"docker compose {' '.join(args)} failed:\n{done.stderr.decode(errors='replace')}")
    return done


def psql(sql: str) -> str:
    done = compose("exec", "-T", "postgres", "psql", "-U", "danchuo", "-d", "danchuo", "-v",
                   "ON_ERROR_STOP=1", "-c", sql)
    return done.stdout.decode(errors="replace")


def put_images(post: bytes, avatar: bytes) -> None:
    """Copy both files in one go. `docker compose cp` of a DIRECTORY creates it on the way in,
    which a per-file copy cannot do - and the backend image has no shell to mkdir with."""
    with tempfile.TemporaryDirectory() as tmp:
        stage = Path(tmp) / "instagram"
        stage.mkdir()
        (stage / "post.img").write_bytes(post)
        (stage / "avatar.img").write_bytes(avatar)
        compose("cp", str(stage), "backend:/data/film/")


def count(raw: str) -> int | None:
    """`none` means the owner hid the counter at the post - a legal state the card renders by
    dropping the line entirely, not by printing a zero."""
    if raw.lower() in ("none", "null", "hidden", "-"):
        return None
    value = int(raw)
    if value < 0:
        raise argparse.ArgumentTypeError("счётчик не бывает отрицательным")
    return value


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the local board with a sample Instagram post")
    parser.add_argument("--username", default="danchuo_")
    parser.add_argument("--permalink", default="https://www.instagram.com/p/DEV0000danchuo/")
    parser.add_argument("--caption", default=CAPTION, help="empty string for a post without one")
    parser.add_argument("--media-type", default="CAROUSEL_ALBUM", choices=["IMAGE", "VIDEO", "CAROUSEL_ALBUM"])
    parser.add_argument("--likes", type=count, default=137, help="number, or `none` if hidden")
    parser.add_argument("--comments", type=count, default=2, help="number, or `none` if hidden")
    parser.add_argument("--age-hours", type=float, default=20.0, help="how long ago it was posted")
    parser.add_argument("--clear", action="store_true", help="remove the post instead of seeding one")
    args = parser.parse_args()

    if args.clear:
        psql("DELETE FROM instagram_post WHERE id = 1")
        print("Пост убран — карточки под маркой снова нет (эндпоинт отвечает 204).")
        return

    put_images(
        png(640, 640, (221, 42, 123), (81, 91, 212)),
        png(160, 160, (245, 133, 41), (254, 218, 119)),
    )

    posted = datetime.now(timezone.utc) - timedelta(hours=args.age_hours)
    values = ", ".join(
        [
            "1",
            quote("dev-sample-media"),
            quote(args.permalink),
            quote(args.caption) if args.caption else "NULL",
            quote(args.media_type),
            str(args.likes) if args.likes is not None else "NULL",
            str(args.comments) if args.comments is not None else "NULL",
            quote(posted.isoformat()),
            quote(args.username),
            "now()",
        ]
    )
    psql(
        "INSERT INTO instagram_post (id, media_id, permalink, caption, media_type, like_count,"
        f" comments_count, posted_at, username, fetched_at) VALUES ({values})"
        " ON CONFLICT (id) DO UPDATE SET media_id = EXCLUDED.media_id,"
        " permalink = EXCLUDED.permalink, caption = EXCLUDED.caption,"
        " media_type = EXCLUDED.media_type, like_count = EXCLUDED.like_count,"
        " comments_count = EXCLUDED.comments_count, posted_at = EXCLUDED.posted_at,"
        " username = EXCLUDED.username, fetched_at = EXCLUDED.fetched_at"
    )
    print(
        f"Пост засеян: @{args.username}, опубликован {args.age_hours:g} ч назад.\n"
        "Смотреть: http://localhost:3000 — навести на марку Instagram в плитке соцсетей."
    )


def quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


if __name__ == "__main__":
    main()
