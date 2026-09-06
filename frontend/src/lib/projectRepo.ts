/**
 * Подпись ссылки проекта — путь репозитория (PRD §5.7). Бэк отдаёт сырой `url`; показывать
 * его целиком незачем: схема (`https://`) не несёт смысла и съедает половину узкой строки.
 *
 * Хост ОСТАЁТСЯ: не всякая ссылка ведёт на GitHub, и `danchuo/proxemics` без хоста было бы
 * догадкой о сервисе, а не путём. Обрезаем ровно шум — схему, `www.` и хвостовой слэш.
 */
export function repoLabel(url: string | null | undefined): string | null {
  const raw = url?.trim();
  if (!raw) return null;
  return raw
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "");
}
