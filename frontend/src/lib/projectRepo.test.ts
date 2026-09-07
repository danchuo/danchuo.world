import { describe, expect, it } from "vitest";
import { repoLabel } from "./projectRepo";

describe("repoLabel", () => {
  it("режет схему: остаётся хост и путь", () => {
    expect(repoLabel("http://example.org/thing")).toBe("example.org/thing");
  });

  /**
   * `danchuo/proxemics` — собственное имя репозитория, которым его зовёт и сам GitHub, и `gh`.
   * Хост в нём — шум: строка перестаёт читаться адресом сайта и становится именем кода.
   */
  it("репозиторий на GitHub теряет хост: остаётся владелец/имя", () => {
    expect(repoLabel("https://github.com/danchuo/proxemics")).toBe("danchuo/proxemics");
    expect(repoLabel("https://www.github.com/danchuo/proxemics/")).toBe("danchuo/proxemics");
  });

  /**
   * У профиля без репозитория срезать хост нечем: `dontyouo` в одиночку не говорит ни о
   * гитхабе, ни о коде. Имя владельца осмысленно только в паре `владелец/репо`.
   */
  it("профиль без репозитория остаётся с хостом", () => {
    expect(repoLabel("https://github.com/dontyouo")).toBe("github.com/dontyouo");
  });

  /** Хост режется только гитхабовский: у прочих он часть имени проекта. */
  it("чужой хост остаётся", () => {
    expect(repoLabel("https://gitlab.com/danchuo/proxemics")).toBe("gitlab.com/danchuo/proxemics");
  });

  it("режет www и хвостовой слэш", () => {
    expect(repoLabel("https://www.gitlab.com/a/b/")).toBe("gitlab.com/a/b");
  });

  /** Ссылки нет — строке взяться неоткуда: подпись просто не рисуется (не «—» и не пустая). */
  it("нет ссылки → null", () => {
    expect(repoLabel(null)).toBeNull();
    expect(repoLabel("")).toBeNull();
    expect(repoLabel("   ")).toBeNull();
  });

  /**
   * Данные заводит владелец руками, и на не-URL строке форматтер не имеет права падать или
   * прятать её: показываем что есть — это виднее, чем тихо исчезнувшая подпись.
   */
  it("не-ссылка показывается как есть", () => {
    expect(repoLabel("локальный эксперимент")).toBe("локальный эксперимент");
  });
});
