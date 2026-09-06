import { describe, expect, it } from "vitest";
import { repoLabel } from "./projectRepo";

describe("repoLabel", () => {
  it("режет схему: остаётся хост и путь", () => {
    expect(repoLabel("https://github.com/danchuo/proxemics")).toBe("github.com/danchuo/proxemics");
    expect(repoLabel("http://example.org/thing")).toBe("example.org/thing");
  });

  it("профиль без репозитория остаётся профилем", () => {
    expect(repoLabel("https://github.com/dontyouo")).toBe("github.com/dontyouo");
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
