#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Сборка графа велодорог Москвы для кнопки «нарисовать случайный путь» (PRD §9 B4).

Качает из OpenStreetMap (Overpass) дороги, по которым может ехать велосипед, оставляет
крупнейшую связную компоненту и пишет компактный бинарь в ресурсы бэкенда.

Зачем скрипт лежит в репозитории: граф — это данные, которые надо обновлять раз в полгода,
и «как он был получен» обязано быть воспроизводимым, а не остаться в чьей-то памяти.

Запуск (из корня репозитория):
    python backend/tools/build-bike-graph.py

Область — bbox всех станций из истории поездок плюс запас: путь с крюком до +40% вправо
выходит за прямоугольник станций, и на краю графа маршрут упёрся бы в пустоту.

Формат файла (см. BikeRouteGraph.kt, читается ровно в том же порядке), всё в gzip:
    "DWG2"                     магия, 4 байта
    varint nodeCount
    nodeCount x (zigzag varint dLat, zigzag varint dLon)   микроградусы, дельты к предыдущему
    varint wayCount
    wayCount x (varint class, varint refCount, refCount x zigzag varint dIndex)

`class` — индекс в CLASS_ORDER: во что дороге обходится велосипед (двор дешевле проспекта).
Версия формата поднята с DWG1 именно из-за него: у DWG1 все дороги стоили одинаково, и
маршрут одинаково охотно шёл по тротуару и по велодорожке.
"""
import gzip
import hashlib
import io
import json
import math
import os
import struct
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict, deque

# bbox станций (замер по истории: 55.6523..55.8217 / 37.4179..37.7386) плюс запас под крюк
SOUTH, NORTH = 55.62, 55.85
WEST, EAST = 37.37, 37.79
MARGIN_NOTE = "запас ~3 км от крайних станций"

# По чему может ехать велосипед. motorway/trunk исключены (нельзя), footway/path/steps —
# тоже: они утраивают размер графа, а веломаршрут по ним всё равно неправдоподобен.
# По чему может ехать велосипед — и КАК ОХОТНО. Ключ — значение `highway`, значение — класс
# (индекс в CLASS_ORDER): он едет в файл по дороге и превращается в множитель цены ребра
# (см. BikeRouteGraph.CLASS_COST). Велосипед не машина и не пешеход: во дворы и парки ему можно,
# но по проспекту и по тротуару он поедет только если сильно короче.
#
# motorway/trunk нет — велосипеду туда нельзя. steps нет — по лестнице не едут, её носят.
CLASS_ORDER = ["cycleway", "quiet", "tertiary", "arterial", "foot"]
HIGHWAY_CLASS = {
    "cycleway": 0,
    "living_street": 1,
    "residential": 1,
    "unclassified": 1,
    "service": 1,
    "tertiary": 2,
    "tertiary_link": 2,
    "primary": 3,
    "primary_link": 3,
    "secondary": 3,
    "secondary_link": 3,
    "pedestrian": 4,
    "footway": 4,
    "path": 4,
    "track": 4,
    "bridleway": 4,
}
HIGHWAYS = "|".join(HIGHWAY_CLASS)

MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

OUT = os.path.join("backend", "src", "main", "resources", "bike", "moscow-bike-graph.bin.gz")


CACHE = os.path.join("backend", "tools", ".osm-cache")


def fetch(south, north, west, east):
    """
    Один прямоугольник. Overpass режет большие запросы по времени и регулярно отвечает 429/504,
    поэтому: мелкие клетки, обход зеркал, ретраи с паузой и **кэш на диске** — перезапуск после
    сбоя не должен выкачивать заново то, что уже приехало (и не должен зря грузить чужой сервер).
    """
    os.makedirs(CACHE, exist_ok=True)
    # Хэш фильтра — В КЛЮЧЕ КЭША: он же входит в запрос, и без него расширение списка дорог
    # молча читалось бы из старого кэша (поймано при переходе с DWG1 на DWG2).
    stamp = hashlib.sha1(HIGHWAYS.encode()).hexdigest()[:8]
    key = f"{south:.4f}_{north:.4f}_{west:.4f}_{east:.4f}_{stamp}.json"
    path = os.path.join(CACHE, key)
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)

    # `out body` у дорог, а не `out skel`: skel срезает теги, а без `highway` не узнать класс
    # дороги. Узлы по-прежнему скелетом — от них нужны только координаты.
    query = (
        "[out:json][timeout:300];"
        f'way["highway"~"^({HIGHWAYS})$"]({south},{west},{north},{east})->.w;'
        ".w out body qt;"
        "node(w.w); out skel qt;"
    )
    body = urllib.parse.urlencode({"data": query}).encode()
    last = None
    for attempt in range(4):
        for host in MIRRORS:
            try:
                req = urllib.request.Request(host, data=body, headers={
                    "User-Agent": "danchuo.world bike graph builder (https://danchuo.world)",
                })
                with urllib.request.urlopen(req, timeout=420) as r:
                    data = json.loads(r.read())
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(data, f)
                return data
            except Exception as e:
                last = e
                print(f"  {host}: {e}", file=sys.stderr, flush=True)
        wait = 20 * (attempt + 1)
        print(f"  пауза {wait}с перед повтором…", file=sys.stderr, flush=True)
        time.sleep(wait)
    raise SystemExit(f"все зеркала Overpass отказали: {last}")


def main():
    print(f"область: {SOUTH}..{NORTH} / {WEST}..{EAST} ({MARGIN_NOTE})", flush=True)
    nodes, ways = {}, []
    # 8x8 клеток по ~2.5 км. Было 5x5 на одних улицах; с дворами, тропами и тротуарами
    # (DWG2) объём клетки вырос в разы, и крупная клетка снова упиралась в 504.
    steps = 8
    for i in range(steps):
        for j in range(steps):
            s = SOUTH + (NORTH - SOUTH) * i / steps
            n = SOUTH + (NORTH - SOUTH) * (i + 1) / steps
            w = WEST + (EAST - WEST) * j / steps
            e = WEST + (EAST - WEST) * (j + 1) / steps
            print(f"клетка {i * steps + j + 1}/{steps * steps}…", flush=True)
            data = fetch(s, n, w, e)
            for el in data["elements"]:
                if el["type"] == "node":
                    nodes[el["id"]] = (el["lat"], el["lon"])
                elif el["type"] == "way" and len(el.get("nodes", [])) > 1:
                    cls = HIGHWAY_CLASS.get(el.get("tags", {}).get("highway"))
                    if cls is not None:
                        ways.append((cls, el["nodes"]))
    print(f"сырьё: {len(nodes)} узлов, {len(ways)} дорог")

    # Крупнейшая связная компонента: точка вне её сделала бы маршрут невозможным молча.
    adj = defaultdict(set)
    for _, w in ways:
        for a, b in zip(w, w[1:]):
            if a in nodes and b in nodes:
                adj[a].add(b)
                adj[b].add(a)
    seen, best = set(), []
    for start in adj:
        if start in seen:
            continue
        comp, q = [], deque([start])
        seen.add(start)
        while q:
            u = q.popleft()
            comp.append(u)
            for v in adj[u]:
                if v not in seen:
                    seen.add(v)
                    q.append(v)
        if len(comp) > len(best):
            best = comp
    keep = set(best)
    print(f"крупнейшая компонента: {len(keep)} из {len(adj)}")

    # Индексируем по возрастанию (lat, lon): соседние узлы получают близкие координаты,
    # поэтому дельты выходят крошечными и gzip жмёт их особенно хорошо.
    ordered = sorted(keep, key=lambda oid: nodes[oid])
    index = {oid: i for i, oid in enumerate(ordered)}

    out = io.BytesIO()
    out.write(b"DWG2")
    write_varint(out, len(ordered))
    prev_lat = prev_lon = 0
    for oid in ordered:
        lat, lon = nodes[oid]
        mlat, mlon = round(lat * 1e6), round(lon * 1e6)
        write_varint(out, zigzag(mlat - prev_lat))
        write_varint(out, zigzag(mlon - prev_lon))
        prev_lat, prev_lon = mlat, mlon

    kept_ways = []
    for cls, w in ways:
        seq = [index[n] for n in w if n in keep]
        if len(seq) > 1:
            kept_ways.append((cls, seq))
    write_varint(out, len(kept_ways))
    for cls, seq in kept_ways:
        write_varint(out, cls)
        write_varint(out, len(seq))
        prev = 0
        for idx in seq:
            write_varint(out, zigzag(idx - prev))
            prev = idx
    raw = out.getvalue()

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with gzip.open(OUT, "wb", compresslevel=9) as f:
        f.write(raw)
    by_class = [0] * len(CLASS_ORDER)
    for cls, _ in kept_ways:
        by_class[cls] += 1
    print("дорог по классам: " + ", ".join(f"{n} {c}" for c, n in zip(CLASS_ORDER, by_class)))
    print(f"дорог в графе: {len(kept_ways)}, узлов: {len(ordered)}")
    print(f"{OUT}: {os.path.getsize(OUT) / 1e6:.2f} МБ (несжатым {len(raw) / 1e6:.2f} МБ)")


def zigzag(v):
    return (v << 1) ^ (v >> 63) if v < 0 else v << 1


def write_varint(buf, v):
    while True:
        b = v & 0x7F
        v >>= 7
        if v:
            buf.write(bytes([b | 0x80]))
        else:
            buf.write(bytes([b]))
            return


if __name__ == "__main__":
    main()
