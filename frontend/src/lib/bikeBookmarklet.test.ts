import { describe, expect, it } from "vitest";
import { BIKE_BOOKMARKLET, BIKE_CONSOLE_SNIPPET } from "./bikeBookmarklet";

describe("bikeBookmarklet", () => {
  it("букмарклет — это javascript:-URL поверх того же тела, что и консоль-сниппет", () => {
    expect(BIKE_BOOKMARKLET).toBe(`javascript:${BIKE_CONSOLE_SNIPPET}`);
  });

  it("JWT-regex пережил экранирование строки (\\w и \\. на месте, не схлопнулись в w/.)", () => {
    // Lose the backslashes and the regex becomes eyJ[w-]+.[w-]+.[w-]+, which catches junk.
    expect(BIKE_CONSOLE_SNIPPET).toContain("/eyJ[\\w-]+\\.[\\w-]+\\.[\\w-]+/");
  });

  it("тело синтаксически валидно (парсится как функция)", () => {
    expect(() => new Function(BIKE_CONSOLE_SNIPPET)).not.toThrow();
  });

  it("бьёт по нужному эндпоинту истории", () => {
    expect(BIKE_CONSOLE_SNIPPET).toContain("/api/rent/rents/client");
    expect(BIKE_CONSOLE_SNIPPET).toContain("statuses=TECH_DONE,DONE");
  });

  it("берёт access-токен из IndexedDB keyval-store и шлёт Bearer (снято с прода)", () => {
    expect(BIKE_CONSOLE_SNIPPET).toContain("indexedDB.open('keyval-store')");
    expect(BIKE_CONSOLE_SNIPPET).toContain("vb-access-token");
    expect(BIKE_CONSOLE_SNIPPET).toContain("Authorization:'Bearer '+t");
  });

  it("дублирует полный JSON в window.__vbRides и отчитывается X из Y (обход обрезки буфера)", () => {
    expect(BIKE_CONSOLE_SNIPPET).toContain("window.__vbRides=x");
    expect(BIKE_CONSOLE_SNIPPET).toContain("copy(__vbRides)");
    expect(BIKE_CONSOLE_SNIPPET).toContain("total=j.totalElements");
  });

  it("обогащает адреса через getPopulatedRent/{id} и подставляет их в поездку", () => {
    // The list serves no address — we fetch the detailed getPopulatedRent and merge station addresses.
    expect(BIKE_CONSOLE_SNIPPET).toContain("/api/rent/v2/rents/getPopulatedRent/");
    expect(BIKE_CONSOLE_SNIPPET).toContain("it.startParkingAddress=pj.startParkingAddress");
    expect(BIKE_CONSOLE_SNIPPET).toContain("it.finishParkingAddress=pj.finishParkingAddress");
  });

  it("тем же заходом собирает покупки тарифов (только TARIFF) и шлёт {rides, tariffs}", () => {
    expect(BIKE_CONSOLE_SNIPPET).toContain("/api/purchases/history");
    expect(BIKE_CONSOLE_SNIPPET).toContain("x.purchaseType==='TARIFF'");
    expect(BIKE_CONSOLE_SNIPPET).toContain("JSON.stringify({rides:a,tariffs:pt})");
  });
});
