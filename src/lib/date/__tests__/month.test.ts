import { describe, expect, it } from "vitest";
import {
  APP_START_MONTH,
  clampMonthKey,
  isAtStartMonth,
  shiftMonthKey,
} from "@/lib/date/month";

describe("month floor (APP_START_MONTH)", () => {
  it("APP_START_MONTH is May 2026", () => {
    expect(APP_START_MONTH).toBe("2026-05");
  });

  describe("clampMonthKey", () => {
    it("floors months before the start to the start month", () => {
      expect(clampMonthKey("2026-04")).toBe("2026-05");
      expect(clampMonthKey("2025-01")).toBe("2026-05");
      expect(clampMonthKey("2000-12")).toBe("2026-05");
    });

    it("leaves the start month and later months untouched", () => {
      expect(clampMonthKey("2026-05")).toBe("2026-05");
      expect(clampMonthKey("2026-08")).toBe("2026-08");
      expect(clampMonthKey("2027-01")).toBe("2027-01");
    });
  });

  describe("isAtStartMonth", () => {
    it("is true at and before the floor (disables the prev arrow there)", () => {
      expect(isAtStartMonth("2026-05")).toBe(true);
      expect(isAtStartMonth("2026-04")).toBe(true);
    });

    it("is false for months after the floor", () => {
      expect(isAtStartMonth("2026-06")).toBe(false);
      expect(isAtStartMonth("2026-12")).toBe(false);
    });
  });

  it("shifting back from the start month yields a pre-floor key that clamps back", () => {
    // The selector guards this, but clamp is the safety net.
    const before = shiftMonthKey(APP_START_MONTH, -1);
    expect(before).toBe("2026-04");
    expect(clampMonthKey(before)).toBe(APP_START_MONTH);
  });
});
