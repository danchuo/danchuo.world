// Кладёт воркер MapLibre в статику сайта — без этого карта не работает вовсе.
//
// Зачем: MapLibre разбирает векторные тайлы в ВОРКЕРЕ, а его код с версии 6 лежит отдельными
// файлами (`maplibre-gl-worker.mjs` + соседний `maplibre-gl-shared.mjs`, который воркер
// импортирует ОТНОСИТЕЛЬНО СЕБЯ). Сборщику Next этот граф не виден: он уносит в статику один
// файл воркера под хэшированным именем, сосед остаётся в node_modules, импорт даёт 404 — и
// воркер молча умирает. Снаружи это выглядит как «карта не работает»: фон стиля нарисован,
// улиц нет, ни одного запроса за тайлами, событие `load` не наступает, ошибок в консоли ноль
// (docs/pitfalls.md).
//
// Поэтому оба файла кладутся рядом друг с другом ПОД СВОИМИ ИМЕНАМИ — тогда относительный
// импорт внутри воркера попадает туда, куда он и целился.
//
// Копией из node_modules, а не файлом в репозитории: копия в гите протухла бы на первом же
// обновлении библиотеки, причём молча — версия в бандле уехала бы, а воркер остался старый.
// Каталог назначения в `.gitignore`, скрипт зовётся хуками `predev`/`prebuild`.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "maplibre-gl", "dist");
const to = join(root, "public", "maplibre");

// Список пополняется, если библиотека разложит воркер ещё на файлы: признак — 404 в сети
// на что-то из `/maplibre/` и пустая карта.
const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

mkdirSync(to, { recursive: true });
for (const file of files) copyFileSync(join(from, file), join(to, file));
console.log(`maplibre: воркер и его сосед скопированы в public/maplibre (${files.length} файла)`);
