import { describe, expect, it } from "vitest";
import { formatBindingValue, isNamedFormat } from "./format";

/**
 * Binding formatting decides the literal characters that go to air. It is one
 * shared implementation across the editor render path, the output bake and the
 * data-mapping UI precisely so a formatted field cannot read one way in the
 * editor and another on Program — these tests pin that shared contract.
 */

describe("no format", () => {
  it("passes the raw value through", () => {
    expect(formatBindingValue("Hello")).toBe("Hello");
    expect(formatBindingValue("Hello", "")).toBe("Hello");
  });
});

describe("legacy {value} template", () => {
  it("substitutes into surrounding text", () => {
    expect(formatBindingValue("3", "{value} PTS")).toBe("3 PTS");
    expect(formatBindingValue("Ada", "Reporting: {value}")).toBe("Reporting: Ada");
  });

  it("groups thousands with the {value:,} hint", () => {
    expect(formatBindingValue("1245000", "{value:,}")).toBe("1,245,000");
    expect(formatBindingValue("1245000", "{value:,} votes")).toBe("1,245,000 votes");
  });

  it("substitutes a non-numeric value instead of printing NaN or the template", () => {
    // Regression: the numeric branch bailed out and the fallthrough replaced
    // `{value}`, which does not match `{value:,}` — so the literal text
    // "{value:,}" went to air whenever a feed sent "—" or "pending" into a
    // thousands-formatted field.
    expect(formatBindingValue("pending", "{value:,}")).toBe("pending");
    expect(formatBindingValue("—", "{value:,} votes")).toBe("— votes");
    expect(formatBindingValue("", "{value:,}")).toBe("");
  });

  it("is not mistaken for a named format", () => {
    expect(isNamedFormat("{value} PTS")).toBe(false);
    expect(isNamedFormat("{value:,}")).toBe(false);
  });
});

describe("named formatters", () => {
  it("changes case", () => {
    expect(formatBindingValue("breaking news", "uppercase")).toBe("BREAKING NEWS");
    expect(formatBindingValue("BREAKING", "lowercase")).toBe("breaking");
    expect(formatBindingValue("breaking news", "titlecase")).toBe("Breaking News");
  });

  it("title-cases across hyphens and slashes", () => {
    expect(formatBindingValue("jean-luc picard", "titlecase")).toBe("Jean-Luc Picard");
    expect(formatBindingValue("win/loss", "titlecase")).toBe("Win/Loss");
  });

  it("rounds numbers", () => {
    expect(formatBindingValue("3.7", "integer")).toBe("4");
    expect(formatBindingValue("3.14159", "decimal")).toBe("3.1");
    expect(formatBindingValue("3.14159", "decimal2")).toBe("3.14");
    expect(formatBindingValue("52.34", "percentage")).toBe("52.3%");
  });

  it("clamps a score to a non-negative integer", () => {
    expect(formatBindingValue("2.6", "score")).toBe("3");
    expect(formatBindingValue("-4", "score")).toBe("0");
  });

  it("passes non-numeric values through every numeric formatter untouched", () => {
    // The alternative is "NaN" on a scorebug, which is worse than a stale value.
    for (const f of ["integer", "decimal", "decimal2", "percentage", "score"]) {
      expect(formatBindingValue("—", f)).toBe("—");
    }
  });

  it("builds a match clock", () => {
    expect(formatBindingValue("90", "clock")).toBe("90:00");
    expect(formatBindingValue("12.5", "clock")).toBe("12:30");
    expect(formatBindingValue("12:30", "clock")).toBe("12:30");
  });

  it("leaves an unparseable clock alone", () => {
    expect(formatBindingValue("HT", "clock")).toBe("HT");
  });

  it("abbreviates team names", () => {
    expect(formatBindingValue("Manchester United", "shortname")).toBe("MU");
    expect(formatBindingValue("Real Madrid Club de Futbol", "shortname")).toBe("RMC");
    expect(formatBindingValue("Arsenal", "shortname")).toBe("ARS");
    expect(formatBindingValue("Arsenal", "shortname:4")).toBe("ARSE");
  });

  it("truncates with an ellipsis", () => {
    expect(formatBindingValue("A very long headline indeed", "truncate:10")).toBe("A very lo…");
    expect(formatBindingValue("Short", "truncate:10")).toBe("Short");
  });

  it("keeps a deliberate leading space in a prefix or suffix arg", () => {
    // "3 PTS", not "3PTS" — the space is what the operator typed, so the arg
    // is deliberately not trimmed.
    expect(formatBindingValue("3", "suffix: PTS")).toBe("3 PTS");
    expect(formatBindingValue("5", "prefix:+")).toBe("+5");
  });

  it("chains formatters left to right", () => {
    expect(formatBindingValue("3.6", "integer|suffix: PTS")).toBe("4 PTS");
    expect(formatBindingValue("manchester united", "titlecase|shortname")).toBe("MU");
    expect(formatBindingValue("a long team name", "uppercase|truncate:8")).toBe("A LONG …");
  });

  it("treats an unrecognised format as literal template text", () => {
    // Not a named-formatter pipe, so it falls through to the `{value}`
    // template path, where a format with no placeholder is constant text by
    // design. Pinned because it is surprising: a typo'd formatter name puts
    // that name on air rather than the value.
    expect(formatBindingValue("value", "notAFormatter")).toBe("notAFormatter");
  });
});

describe("isNamedFormat", () => {
  it("recognises single and piped formatter lists", () => {
    expect(isNamedFormat("uppercase")).toBe(true);
    expect(isNamedFormat("integer|suffix: PTS")).toBe(true);
    expect(isNamedFormat("truncate:12|titlecase")).toBe(true);
  });

  it("rejects arbitrary text so it falls through to the template path", () => {
    expect(isNamedFormat("notAFormatter")).toBe(false);
    expect(isNamedFormat("")).toBe(false);
    expect(isNamedFormat("uppercase|notAFormatter")).toBe(false);
  });

  it("is case-insensitive on formatter ids", () => {
    expect(isNamedFormat("UPPERCASE")).toBe(true);
    expect(formatBindingValue("x", "UpperCase")).toBe("X");
  });
});

describe("values that must never corrupt a graphic", () => {
  it("handles an empty string without throwing", () => {
    for (const f of ["uppercase", "integer", "clock", "shortname", "truncate:5", "{value} PTS"]) {
      expect(() => formatBindingValue("", f)).not.toThrow();
    }
  });

  it("does not interpret the value as a format template", () => {
    // A feed sending "{value}" as data must render literally, not recurse.
    expect(formatBindingValue("{value}", "{value}")).toBe("{value}");
  });
});
