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
  * a book started from scratch today - start is honestly 0%, and the card reads "0% -> 22%".

Both books are uploaded as real EPUBs as well, because the reader syncs those too and the
retelling of a stretch (PRD 5.16) is built from the book text and nothing else. The one with a
known start is therefore the one that grows a "пересказ" button on its card.

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


# Текст книг полки. Настоящий Anx синкает epub вместе с базой, и пересказ прочитанного куска
# (PRD 5.16) собирается ТОЛЬКО по нему - без файла на полке кнопки на карточке просто нет.
# Поэтому фикстуре нужен не заглушечный zip, а связная проза: по ней видно, попал ли пересказ
# в тот кусок, который "прочитан", или уехал в соседнюю главу. Текст оригинальный, чтобы у
# скрипта не было ни сети, ни вопросов о правах.
CHAPTERS: list[tuple[str, list[str]]] = [
    (
        "Глава первая. Смотритель",
        [
            "Смотрителя маяка звали Игнат, и он не любил, когда его называли смотрителем. "
            "Маяк стоял на скале уже сто двадцать лет, свет его давно заменили на автоматический, "
            "и всё, что оставалось Игнату, — раз в сутки подниматься наверх и записывать в журнал, "
            "что лампа цела, стекло чистое, а море на месте.",
            "Журнал был толстый, в клеёнчатой обложке, и записи в нём шли с довоенных лет. "
            "Игнат любил читать чужие строчки: в них попадались шторма, потерянные шхуны и "
            "однажды — целая страница про кита, который три дня ходил кругами у самой скалы. "
            "Свои записи он старался делать такими же короткими.",
            "В тот вечер лампа была цела, стекло чистое, а море — не на месте. "
            "Вода у подножия скалы стояла ровно, как налитая в блюдце, без единой складки, "
            "и это было неправильно: ветер дул с северо-востока и должен был гнать волну.",
            "Игнат спустился, обошёл скалу по нижней тропе и увидел лодку. "
            "Она лежала на камнях носом к берегу, целая, без единой царапины, "
            "и была пуста. Вёсла лежали внутри, аккуратно сложенные, как их кладёт человек, "
            "который собирается вернуться через минуту.",
            "Он подождал у лодки до темноты. Никто не пришёл. "
            "Тогда Игнат вытащил её выше линии прилива, привязал к железному кольцу "
            "и поднялся к себе записать в журнал первую за двенадцать лет службы строчку, "
            "которая не была про лампу.",
            "Ночью ему казалось, что снизу кто-то стучит по камню — коротко, с одинаковыми "
            "промежутками, будто проверяет, слушают ли его. Игнат считал промежутки, пока не сбился, "
            "и заснул только к утру.",
        ],
    ),
    (
        "Глава вторая. Журнал",
        [
            "Утром лодка была на месте, а вёсла — нет. Игнат искал их до полудня "
            "и нашёл одно, воткнутое лопастью в песок у самой воды, стоймя, как знак.",
            "Он вернулся к журналу и стал читать назад — не про шторма, а про даты. "
            "Оказалось, что запись про кита сделана ровно двадцать лет назад в этот же день. "
            "Ниже, тем же почерком, стояла ещё одна строчка, которую он раньше не замечал: "
            "«лодка на нижней тропе, пустая, вёсла внутри».",
            "Почерк принадлежал смотрителю по фамилии Вейс, который служил здесь до Игната "
            "и уехал, не дождавшись смены. В посёлке про него говорили неохотно и всегда одно и то же: "
            "хороший был человек, только под конец перестал спускаться вниз.",
            "Игнат выписал все даты, где в журнале появлялась лодка. Их было пять, "
            "и между ними лежало ровно по двадцать лет. Самая ранняя запись была сделана "
            "не чернилами, а карандашом, и почти стёрлась, но слово «пустая» читалось.",
            "Он сходил в посёлок и спросил у почтальонши, не помнит ли она Вейса. "
            "Почтальонша сказала, что помнит, и что письма ему приходили редко, "
            "зато всегда с одного адреса — с маяка, который стоит на сто миль южнее и "
            "закрыт с семидесятых.",
            "Вечером Игнат поднялся наверх, проверил лампу и впервые за двенадцать лет "
            "не стал записывать, что она цела. Вместо этого он написал: «жду».",
        ],
    ),
    (
        "Глава третья. Прилив",
        [
            "Ждать пришлось четыре дня. На пятый вода снова встала блюдцем, "
            "и Игнат спустился к лодке засветло, взяв с собой журнал и найденное весло.",
            "На камнях сидел человек в брезентовом плаще и сушил рукава. "
            "Он не обернулся на шаги и сказал, что за двадцать лет ничего тут не изменилось, "
            "кроме лампы, и что лампу жалко: прежняя гудела, а эта молчит.",
            "Игнат спросил, он ли Вейс. Человек ответил, что фамилия ему больше не нужна, "
            "и попросил показать журнал. Он листал его долго, находил свои страницы и хмыкал, "
            "будто читал чужое.",
            "Потом он объяснил простую вещь: маяк держит не свет, а то, что кто-то каждый день "
            "поднимается наверх и записывает, что море на месте. Пока записывают — оно на месте. "
            "Лодка приходит проверить, не бросили ли запись.",
            "Игнат сказал, что двенадцать лет пишет одно и то же и не видит в этом смысла. "
            "Человек ответил, что смысл как раз в этом, и вернул журнал.",
            "К вечеру вода снова пошла складками, ветер повернул, и лодки на камнях не стало — "
            "ни следа на песке, ни вмятины. Игнат поднялся наверх, проверил лампу и записал, "
            "что она цела, стекло чистое, а море на месте. Строчка вышла короткая, как он любил.",
        ],
    ),
]


def epub(title: str, author: str) -> bytes:
    """A minimal but valid EPUB: container -> OPF -> chapters, exactly what the backend parses."""
    import zipfile
    from io import BytesIO

    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as book:
        # The mimetype entry must come first and stay uncompressed (readers check that).
        book.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", zipfile.ZIP_STORED)
        book.writestr(
            "META-INF/container.xml",
            '<?xml version="1.0"?>\n'
            '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
            '<rootfiles><rootfile full-path="OEBPS/content.opf"'
            ' media-type="application/oebps-package+xml"/></rootfiles></container>',
        )
        items, refs = [], []
        for index, (heading, paragraphs) in enumerate(CHAPTERS, start=1):
            name = f"ch{index}.xhtml"
            body = "".join(f"<p>{p}</p>" for p in paragraphs)
            book.writestr(
                f"OEBPS/{name}",
                '<?xml version="1.0" encoding="utf-8"?>\n'
                '<html xmlns="http://www.w3.org/1999/xhtml"><head>'
                f"<title>{heading}</title></head><body><h1>{heading}</h1>{body}</body></html>",
            )
            items.append(f'<item id="c{index}" href="{name}" media-type="application/xhtml+xml"/>')
            refs.append(f'<itemref idref="c{index}"/>')
        book.writestr(
            "OEBPS/content.opf",
            '<?xml version="1.0" encoding="utf-8"?>\n'
            '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">'
            '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">'
            f"<dc:title>{title}</dc:title><dc:creator>{author}</dc:creator>"
            '<dc:identifier id="id">dev-shelf</dc:identifier><dc:language>ru</dc:language>'
            "</metadata>"
            f"<manifest>{''.join(items)}</manifest><spine>{''.join(refs)}</spine></package>",
        )
    return buffer.getvalue()


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
        # (id, title, author, cover, file, percentage, is_deleted)
        (1, "Хребты безумия", "Говард Лавкрафт", "cover/lovecraft.png", "file/lovecraft.epub", 0.42, 0),
        (2, "Дюна", "Фрэнк Херберт", "cover/dune.png", "file/dune.epub", 0.22, 0),
        # Soft deleted: must never reach the board - a shelf keeps its leftovers.
        (3, "Проба пера", "Никто", None, None, 0.9, 1),
    ]
    connection.executemany(
        "INSERT INTO tb_books(id, title, author, cover_path, file_path, reading_percentage, is_deleted) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
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
        for collection in ("anx", "anx/data", "anx/data/cover", "anx/data/file"):
            upload(args.url, args.user, args.password, collection, None, "MKCOL")

        covers = {
            "anx/data/cover/lovecraft.png": png(240, 360, (46, 52, 74), (108, 92, 132)),
            "anx/data/cover/dune.png": png(240, 360, (196, 138, 74), (238, 206, 146)),
        }
        for remote, body in covers.items():
            upload(args.url, args.user, args.password, remote, body, "PUT")

        # Сами книги: без них пересказ прочитанного куска собрать не из чего (PRD 5.16).
        # Текст у обеих один - фикстуре важен не сюжет, а то, что кусок вырезается по процентам.
        files = {
            "anx/data/file/lovecraft.epub": epub("Хребты безумия", "Говард Лавкрафт"),
            "anx/data/file/dune.epub": epub("Дюна", "Фрэнк Херберт"),
        }
        for remote, body in files.items():
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
