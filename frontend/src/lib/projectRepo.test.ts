import { describe, expect, it } from "vitest";
import { repoLabel } from "./projectRepo";

describe("repoLabel", () => {
  it("режет схему: остаётся хост и путь", () => {
    expect(repoLabel("http://example.org/thing")).toBe("example.org/thing");
  });

  /**
   * `owner/repo` is a repository's own name, the one GitHub and `gh` call it by. The host in it is
   * noise: the string stops reading as a website address and becomes the name of some code.
   */
  it("репозиторий на GitHub теряет хост: остаётся владелец/имя", () => {
    expect(repoLabel("https://github.com/danchuo/proxemics")).toBe("danchuo/proxemics");
    expect(repoLabel("https://www.github.com/danchuo/proxemics/")).toBe("danchuo/proxemics");
  });

  /**
   * A profile with no repository has nothing to trim: the owner's name alone says nothing about
   * GitHub or code. It is meaningful only in the `owner/repo` pair.
   */
  it("профиль без репозитория остаётся с хостом", () => {
    expect(repoLabel("https://github.com/dontyouo")).toBe("github.com/dontyouo");
  });

  /** Only GitHub's host is trimmed: elsewhere it is part of the project's name. */
  it("чужой хост остаётся", () => {
    expect(repoLabel("https://gitlab.com/danchuo/proxemics")).toBe("gitlab.com/danchuo/proxemics");
  });

  it("режет www и хвостовой слэш", () => {
    expect(repoLabel("https://www.gitlab.com/a/b/")).toBe("gitlab.com/a/b");
  });

  /** With no link there is nothing to build the line from: the caption is simply not drawn. */
  it("нет ссылки → null", () => {
    expect(repoLabel(null)).toBeNull();
    expect(repoLabel("")).toBeNull();
    expect(repoLabel("   ")).toBeNull();
  });

  /**
   * The owner enters this data by hand, and on a non-URL string the formatter may neither fail nor
   * hide it: showing what is there is more visible than a caption that quietly vanished.
   */
  it("не-ссылка показывается как есть", () => {
    expect(repoLabel("локальный эксперимент")).toBe("локальный эксперимент");
  });
});
