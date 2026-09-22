import { describe, expect, it } from "vitest";
import { instagramCommentsUrl, instagramProfileUrl } from "./instagram";

describe("instagramProfileUrl", () => {
  it("builds the profile address from the nickname", () => {
    expect(instagramProfileUrl("danchuo_")).toBe("https://www.instagram.com/danchuo_/");
  });

  it("strips the \"at\" sign and spaces if the nickname came decorated", () => {
    expect(instagramProfileUrl(" @danchuo_ ")).toBe("https://www.instagram.com/danchuo_/");
  });
});

describe("instagramCommentsUrl", () => {
  it("appends the segment to a permalink with a trailing slash", () => {
    expect(instagramCommentsUrl("https://www.instagram.com/p/DcnkVm1lwyY/")).toBe(
      "https://www.instagram.com/p/DcnkVm1lwyY/comments/",
    );
  });

  it("and to a permalink without a slash", () => {
    expect(instagramCommentsUrl("https://www.instagram.com/p/DcnkVm1lwyY")).toBe(
      "https://www.instagram.com/p/DcnkVm1lwyY/comments/",
    );
  });

  /** A permalink may carry a query tail, and appending by string would push the segment into it. */
  it("drops the parameters instead of appending the segment to them", () => {
    expect(instagramCommentsUrl("https://www.instagram.com/p/DcnkVm1lwyY/?igsh=abc123")).toBe(
      "https://www.instagram.com/p/DcnkVm1lwyY/comments/",
    );
  });

  it("an unreadable address is returned as is — opening the post beats leading somewhere at random", () => {
    expect(instagramCommentsUrl("не-адрес")).toBe("не-адрес");
  });
});
