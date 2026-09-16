import { describe, expect, it } from "vitest";
import { instagramCommentsUrl, instagramProfileUrl } from "./instagram";

describe("instagramProfileUrl", () => {
  it("собирает адрес профиля по нику", () => {
    expect(instagramProfileUrl("danchuo_")).toBe("https://www.instagram.com/danchuo_/");
  });

  it("снимает «собаку» и пробелы, если ник приехал украшенным", () => {
    expect(instagramProfileUrl(" @danchuo_ ")).toBe("https://www.instagram.com/danchuo_/");
  });
});

describe("instagramCommentsUrl", () => {
  it("дописывает сегмент к пермалинку со слэшем на конце", () => {
    expect(instagramCommentsUrl("https://www.instagram.com/p/DcnkVm1lwyY/")).toBe(
      "https://www.instagram.com/p/DcnkVm1lwyY/comments/",
    );
  });

  it("и к пермалинку без слэша", () => {
    expect(instagramCommentsUrl("https://www.instagram.com/p/DcnkVm1lwyY")).toBe(
      "https://www.instagram.com/p/DcnkVm1lwyY/comments/",
    );
  });

  /** A permalink may carry a query tail, and appending by string would push the segment into it. */
  it("отбрасывает параметры, а не приписывает сегмент к ним", () => {
    expect(instagramCommentsUrl("https://www.instagram.com/p/DcnkVm1lwyY/?igsh=abc123")).toBe(
      "https://www.instagram.com/p/DcnkVm1lwyY/comments/",
    );
  });

  it("нечитаемый адрес отдаёт как есть — открыть пост лучше, чем увести наугад", () => {
    expect(instagramCommentsUrl("не-адрес")).toBe("не-адрес");
  });
});
