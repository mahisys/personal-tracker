import { describe, expect, it } from "vitest";
import { dayHeading, greetingFor, longDate, plateLine } from "./greeting";

describe("today copy", () => {
  it("greets by IST hour", () => {
    expect(greetingFor(7).text).toBe("Good morning");
    expect(greetingFor(13).text).toBe("Good afternoon");
    expect(greetingFor(19).text).toBe("Good evening");
    expect(greetingFor(23).text).toBe("Good night");
  });
  it("adapts the plate line", () => {
    expect(plateLine({ needs: 0, overdue: 0, doneToday: 0, openToday: 0 })).toBe("All clear. Enjoy the calm.");
    expect(plateLine({ needs: 3, overdue: 0, doneToday: 0, openToday: 3 })).toBe("3 things on your plate — you've got this.");
    expect(plateLine({ needs: 1, overdue: 0, doneToday: 0, openToday: 1 })).toMatch(/one thing/);
    expect(plateLine({ needs: 4, overdue: 1, doneToday: 0, openToday: 2 })).toMatch(/overdue one/);
  });
  it("formats dates", () => {
    expect(longDate("2026-10-14")).toBe("Wednesday, 14 October");
    expect(dayHeading("2026-10-15", "2026-10-14").title).toBe("Tomorrow");
    expect(dayHeading("2026-10-17", "2026-10-14")).toEqual({ title: "Saturday", sub: "17 Oct" });
  });
});
