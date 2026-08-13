#!/usr/bin/env python3
"""Fill the local stack with a fake Anx Reader shelf (PRD 5.16, reading slice).

Reading data reaches the board over a real WebDAV sync from the owner's phone, which is a poor
fit for looking at the tile while building it. This script plays the phone: it assembles a real
SQLite database in the reader's own schema, generates portrait covers, and uploads the whole
thing to the WebDAV endpoint exactly the way the app would.

That matters more than a couple of rows seeded straight into Postgres would: the data travels
the ACTUAL path - WebDAV upload, shelf discovery, SQLite parsing, session reconstruction - so
what shows up on the board is proof the pipeline works, not a picture of what it might look like.

    python scripts/dev-anx-shelf.py

The fixture deliberately covers the two states that differ on screen:
  * a book with history behind it - the first session we ever witness has an unknown start, so
    the card shows where it stopped and no arrow (we do not invent the part we did not see);
  * a book started from scratch today - start is honestly 0%, and the card reads "0% -> 8%".

The backend picks the shelf up on its next poll (every 5 minutes, see danchuo.reading.*).
"""

from __future__ import annotations

import argparse
import base64
import os
import sqlite3
import struct
import tempfile
import urllib.request
import zlib
from datetime import date, timedelta
from pathlib import Path

DEFAULT_URL = "http://localhost:6065/dav"
DEFAULT_USER = "danchuo"
DEFAULT_PASSWORD = "dev-webdav-change-me"

# Schema version in the remote file name; the backend picks the highest one it finds.
DB_VERSION = 7


def png(width: int, height: int, top: tuple[int, int, int], bottom: tuple[int, int, int]) -> bytes:
    """A portrait cover as a vertical gradient. Book covers are taller than wide (~2:3), and the
    board leans on that - a square placeholder would make the tile look right for the wrong
    reason. Written by hand to keep the script dependency free (no Pillow on a fresh machine)."""
    rows = bytearray()
    for y in range(height):
        t = y / max(1, height - 1)
        colour = bytes(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        rows.append(0)  # filter type: none
        rows.extend(colour * width)

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


def build_database(path: Path, today: date) -> None:
    """The reader's own schema, only the columns the backend reads are populated."""
    connection = sqlite3.connect(path)
    connection.executescript(
        """
        CREATE TABLE tb_books (
          id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, cover_path TEXT, file_path TEXT,
          last_read_position TEXT, reading_percentage REAL, author TEXT, is_deleted INTEGER,
          description TEXT, create_time TEXT, update_time TEXT, rating REAL, group_id INTEGER,
          file_md5 TEXT
        );
        CREATE TABLE tb_reading_time (
          id INTEGER PRIMARY KEY, book_id INTEGER, date TEXT, reading_time INTEGER
        );
        """
    )

    books = [
        # (id, title, author, cover, percentage, is_deleted)
        (1, "Хребты безумия", "Говард Лавкрафт", "cover/lovecraft.png", 0.42, 0),
        (2, "Дюна", "Фрэнк Херберт", "cover/dune.png", 0.08, 0),
        # Soft deleted: must never reach the board - a shelf keeps its leftovers.
        (3, "Проба пера", "Никто", None, 0.9, 1),
    ]
    connection.executemany(
        "INSERT INTO tb_books(id, title, author, cover_path, reading_percentage, is_deleted) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        books,
    )

    day = lambda back: (today - timedelta(days=back)).isoformat()  # noqa: E731
    sessions = [
        # Book 1 carries history: those days land as imported rows (minutes known, nothing else).
        (1, day(4), 33 * 60),
        (1, day(3), 51 * 60),
        (1, day(1), 28 * 60),
        # Today: a live session for the book we already know, and one for a book started now.
        (1, day(0), 32 * 60),
        (2, day(0), 26 * 60),
    ]
    connection.executemany(
        "INSERT INTO tb_reading_time(book_id, date, reading_time) VALUES (?, ?, ?)", sessions
    )
    connection.commit()
    connection.close()


def upload(url: str, user: str, password: str, remote: str, body: bytes | None, method: str) -> None:
    request = urllib.request.Request(f"{url.rstrip('/')}/{remote}", data=body, method=method)
    token = base64.b64encode(f"{user}:{password}".encode()).decode()
    request.add_header("Authorization", f"Basic {token}")
    try:
        with urllib.request.urlopen(request) as response:
            print(f"  {method:6} {remote:32} {response.status}")
    except urllib.error.HTTPError as error:
        # MKCOL on an existing collection answers 405 - that is a fine outcome here.
        if method == "MKCOL" and error.code in (405, 301):
            print(f"  {method:6} {remote:32} exists")
            return
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=DEFAULT_URL, help=f"WebDAV endpoint (default {DEFAULT_URL})")
    parser.add_argument("--user", default=DEFAULT_USER)
    parser.add_argument("--password", default=DEFAULT_PASSWORD)
    args = parser.parse_args()

    today = date.today()
    with tempfile.TemporaryDirectory() as workspace:
        database = Path(workspace) / f"database{DB_VERSION}.db"
        build_database(database, today)

        print(f"uploading a fake shelf to {args.url}")
        for collection in ("anx", "anx/data", "anx/data/cover"):
            upload(args.url, args.user, args.password, collection, None, "MKCOL")

        covers = {
            "anx/data/cover/lovecraft.png": png(240, 360, (46, 52, 74), (108, 92, 132)),
            "anx/data/cover/dune.png": png(240, 360, (196, 138, 74), (238, 206, 146)),
        }
        for remote, body in covers.items():
            upload(args.url, args.user, args.password, remote, body, "PUT")

        upload(
            args.url,
            args.user,
            args.password,
            f"anx/database{DB_VERSION}.db",
            database.read_bytes(),
            "PUT",
        )

    print("done - the backend absorbs it on its next poll (up to 5 minutes)")


if __name__ == "__main__":
    main()
