import { describe, expect, it, beforeEach } from "vitest";
import { useDataStore } from "./dataSources";
import {
  mergeExternalValues,
  parseCsvToValues,
  routeExternalValues,
  flattenJsonValues,
} from "./externalConnector";

describe("routeExternalValues", () => {
  it("routes dotted keys to their source and bare keys to mock", () => {
    expect(
      routeExternalValues({
        "weather.temp": "24",
        "soccer.homeScore": "2",
        "brand.panelBg": "#000",
        headline: "Bare key",
      }),
    ).toEqual({
      weather: { temp: "24" },
      soccer: { homeScore: "2" },
      brand: { panelBg: "#000" },
      mock: { headline: "Bare key" },
    });
  });

  it("keeps the whole dotted key when the prefix is not a known source", () => {
    // Splitting on a meaningless dot would produce a `nonsense` source nothing
    // reads from, silently dropping the value.
    expect(routeExternalValues({ "nonsense.field": "v" })).toEqual({
      mock: { "nonsense.field": "v" },
    });
  });
});

describe("mergeExternalValues", () => {
  beforeEach(() => {
    useDataStore.setState({
      weather: { id: "weather", name: "Weather", values: { temp: "0°", location: "OLD" } },
    });
  });

  it("applies a whole multi-source payload in ONE store update", () => {
    // Regression: this used a per-key setter in a loop, and every store write
    // re-resolves bindings and re-bakes output. A 200-key REST poll cost 200
    // output bakes on the live poll path. `mergeFeedValues` existed for exactly
    // this and only the sports connector used it.
    let updates = 0;
    const unsubscribe = useDataStore.subscribe(() => {
      updates++;
    });

    mergeExternalValues({
      "weather.temp": "31°",
      "weather.high": "33°",
      "weather.wind": "8 KM/H",
      "soccer.homeScore": "3",
      headline: "Live now",
    });

    unsubscribe();
    expect(updates).toBe(1);
  });

  it("merges into existing values rather than replacing the source", () => {
    mergeExternalValues({ "weather.temp": "31°" });
    const weather = useDataStore.getState().weather.values;
    expect(weather.temp).toBe("31°");
    expect(weather.location).toBe("OLD");
  });

  it("ignores an empty payload without touching the store", () => {
    let updates = 0;
    const unsubscribe = useDataStore.subscribe(() => {
      updates++;
    });
    mergeExternalValues({});
    unsubscribe();
    expect(updates).toBe(0);
  });
});

describe("parseCsvToValues", () => {
  it("reads a key/value CSV with a header row", () => {
    expect(parseCsvToValues("key,value\nheadline,Hello\nkicker,BREAKING")).toEqual({
      headline: "Hello",
      kicker: "BREAKING",
    });
  });

  it("honours quoted fields containing commas and escaped quotes", () => {
    expect(parseCsvToValues('key,value\nquote,"He said ""go"", then left"')).toEqual({
      quote: 'He said "go", then left',
    });
  });

  it("reads a two-column header/row CSV as header->row, not as key/value", () => {
    // Regression: the key/value branch used to swallow this shape and treat
    // the header itself as a pair, yielding {home: "away", "2": "1"}.
    expect(parseCsvToValues("home,away\n2,1")).toEqual({ home: "2", away: "1" });
  });

  it("reads a wide header/row CSV", () => {
    expect(parseCsvToValues("title,venue,kickoff\nFinal,Stadium,20:00")).toEqual({
      title: "Final",
      venue: "Stadium",
      kickoff: "20:00",
    });
  });

  it("still reads a headerless multi-row key/value list", () => {
    expect(parseCsvToValues("headline,Hello\nkicker,BREAKING\nchannel,NEWS")).toEqual({
      headline: "Hello",
      kicker: "BREAKING",
      channel: "NEWS",
    });
  });

  it("returns nothing for empty input rather than throwing", () => {
    expect(parseCsvToValues("   ")).toEqual({});
  });
});

describe("flattenJsonValues", () => {
  it("flattens nested objects into dotted binding keys", () => {
    expect(flattenJsonValues({ weather: { temp: 24, wind: { kph: 12 } } })).toEqual({
      "weather.temp": "24",
      "weather.wind.kph": "12",
    });
  });

  it("coerces null to an empty string instead of the text 'null'", () => {
    expect(flattenJsonValues({ a: null })).toEqual({ a: "" });
  });
});
