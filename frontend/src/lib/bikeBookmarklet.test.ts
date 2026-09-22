import { describe, expect, it } from "vitest";
import { BIKE_BOOKMARKLET, BIKE_CONSOLE_SNIPPET } from "./bikeBookmarklet";

describe("bikeBookmarklet", () => {
  it("the bookmarklet is a javascript: URL over the same body as the console snippet", () => {
    expect(BIKE_BOOKMARKLET).toBe(`javascript:${BIKE_CONSOLE_SNIPPET}`);
  });

  it("JWT regex survived string escaping (\\w and \\. intact, not collapsed into w/.)", () => {
    // Lose the backslashes and the regex becomes eyJ[w-]+.[w-]+.[w-]+, which catches junk.
    expect(BIKE_CONSOLE_SNIPPET).toContain("/eyJ[\\w-]+\\.[\\w-]+\\.[\\w-]+/");
  });

  it("the body is syntactically valid (parses as a function)", () => {
    expect(() => new Function(BIKE_CONSOLE_SNIPPET)).not.toThrow();
  });

  it("hits the right history endpoint", () => {
    expect(BIKE_CONSOLE_SNIPPET).toContain("/api/rent/rents/client");
    expect(BIKE_CONSOLE_SNIPPET).toContain("statuses=TECH_DONE,DONE");
  });

  it("takes the access token from IndexedDB keyval-store and sends Bearer (captured from prod)", () => {
    expect(BIKE_CONSOLE_SNIPPET).toContain("indexedDB.open('keyval-store')");
    expect(BIKE_CONSOLE_SNIPPET).toContain("vb-access-token");
    expect(BIKE_CONSOLE_SNIPPET).toContain("Authorization:'Bearer '+t");
  });

  it("duplicates the full JSON into window.__vbRides and reports X of Y (working around buffer truncation)", () => {
    expect(BIKE_CONSOLE_SNIPPET).toContain("window.__vbRides=x");
    expect(BIKE_CONSOLE_SNIPPET).toContain("copy(__vbRides)");
    expect(BIKE_CONSOLE_SNIPPET).toContain("total=j.totalElements");
  });

  it("enriches addresses via getPopulatedRent/{id} and puts them into the ride", () => {
    // The list serves no address — we fetch the detailed getPopulatedRent and merge station addresses.
    expect(BIKE_CONSOLE_SNIPPET).toContain("/api/rent/v2/rents/getPopulatedRent/");
    expect(BIKE_CONSOLE_SNIPPET).toContain("it.startParkingAddress=pj.startParkingAddress");
    expect(BIKE_CONSOLE_SNIPPET).toContain("it.finishParkingAddress=pj.finishParkingAddress");
  });

  it("in the same pass collects tariff purchases (TARIFF only) and sends {rides, tariffs}", () => {
    expect(BIKE_CONSOLE_SNIPPET).toContain("/api/purchases/history");
    expect(BIKE_CONSOLE_SNIPPET).toContain("x.purchaseType==='TARIFF'");
    expect(BIKE_CONSOLE_SNIPPET).toContain("JSON.stringify({rides:a,tariffs:pt})");
  });
});
