import { describe, expect, it } from "vitest";
import {
  availabilityLabel,
  isIncluded,
  sortByAvailability,
  type AvailabilityType,
} from "./availability";

const row = (provider: string, availability_type: AvailabilityType) => ({
  provider,
  availability_type,
});

describe("sortByAvailability", () => {
  it("puts subscription and free before rent and buy", () => {
    const sorted = sortByAvailability([
      row("PRIME", "buy"),
      row("YES", "rent"),
      row("PARTNER_TV", "free"),
      row("NETFLIX", "subscription"),
    ]);
    expect(sorted.map((r) => r.availability_type)).toEqual([
      "subscription",
      "free",
      "rent",
      "buy",
    ]);
  });

  it("keeps the input order within a kind", () => {
    const sorted = sortByAvailability([
      row("PRIME", "rent"),
      row("DISNEY_PLUS", "subscription"),
      row("NETFLIX", "rent"),
      row("YES", "subscription"),
    ]);
    expect(sorted.map((r) => r.provider)).toEqual([
      "DISNEY_PLUS",
      "YES",
      "PRIME",
      "NETFLIX",
    ]);
  });

  it("keeps a provider's rent and buy rows in that order", () => {
    const sorted = sortByAvailability([
      row("PRIME", "buy"),
      row("PRIME", "rent"),
    ]);
    expect(sorted.map((r) => r.availability_type)).toEqual(["rent", "buy"]);
  });

  it("returns a new array and leaves the input alone", () => {
    const input = [row("PRIME", "buy"), row("NETFLIX", "subscription")];
    const copy = [...input];
    const sorted = sortByAvailability(input);
    expect(sorted).not.toBe(input);
    expect(input).toEqual(copy);
  });

  it("handles no rows and one row", () => {
    expect(sortByAvailability([])).toEqual([]);
    const one = [row("YES", "free")];
    expect(sortByAvailability(one)).toEqual(one);
  });

  it("keeps the rest of each row", () => {
    const full = { ...row("YES", "free"), watch_url: "https://yes.co.il/x" };
    expect(sortByAvailability([full])[0]).toBe(full);
  });

  it("sorts an unknown kind last instead of throwing", () => {
    const odd = row("YES", "lease" as AvailabilityType);
    const sorted = sortByAvailability([odd, row("NETFLIX", "buy")]);
    expect(sorted.map((r) => r.provider)).toEqual(["NETFLIX", "YES"]);
  });

  it("treats Object.prototype names as unknown kinds", () => {
    const sorted = sortByAvailability([
      row("YES", "constructor" as AvailabilityType),
      row("PRIME", "toString" as AvailabilityType),
      row("NETFLIX", "rent"),
    ]);
    expect(sorted.map((r) => r.provider)).toEqual(["NETFLIX", "YES", "PRIME"]);
  });
});

describe("availabilityLabel", () => {
  it("names each kind", () => {
    expect(availabilityLabel("subscription")).toBe("Subscription");
    expect(availabilityLabel("free")).toBe("Free");
    expect(availabilityLabel("rent")).toBe("Rent");
    expect(availabilityLabel("buy")).toBe("Buy");
  });

  it("shows an unknown kind as it came instead of nothing", () => {
    expect(availabilityLabel("ads" as AvailabilityType)).toBe("ads");
    expect(availabilityLabel("toString" as AvailabilityType)).toBe("toString");
  });
});

describe("isIncluded", () => {
  it("is true for subscription and free only", () => {
    expect(isIncluded("subscription")).toBe(true);
    expect(isIncluded("free")).toBe(true);
    expect(isIncluded("rent")).toBe(false);
    expect(isIncluded("buy")).toBe(false);
  });
});
