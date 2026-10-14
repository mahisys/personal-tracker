import { describe, expect, it } from "vitest";
import { validateBusiness, validateFinance, validateNotifications, validatePlanning } from "./validate";

describe("settings validation", () => {
  it("accepts a valid GSTIN and derives state and PAN", () => {
    const r = validateBusiness({ name: "MahiSys", gstin: "27abcde1234f1z5", stateCode: "", defaultPaymentTermsDays: "15" });
    expect(r.error).toBeUndefined();
    expect(r.value).toMatchObject({ gstin: "27ABCDE1234F1Z5", stateCode: "27", pan: "ABCDE1234F" });
  });
  it("rejects a malformed GSTIN or a mismatched state", () => {
    expect(validateBusiness({ name: "x", gstin: "27ABCDE1234F1X5" }).error).toMatch(/GSTIN/);
    expect(validateBusiness({ name: "x", gstin: "27ABCDE1234F1Z5", stateCode: "29" }).error).toMatch(/Maharashtra/);
  });
  it("validates IFSC, UPI and prefixes", () => {
    expect(validateBusiness({ name: "x", bankIfsc: "HDFC1234567" }).error).toMatch(/IFSC/);
    expect(validateBusiness({ name: "x", bankIfsc: "hdfc0001234", upiId: "mahi@okhdfc" }).value?.bankIfsc).toBe("HDFC0001234");
    expect(validateBusiness({ name: "x", upiId: "nope" }).error).toMatch(/UPI/);
    expect(validateBusiness({ name: "x", invoicePrefix: "MS 26" }).error).toMatch(/Prefixes/);
  });
  it("planning needs workdays and sane hours", () => {
    expect(validatePlanning({ dailyHours: "6.4" }, ["1", "2", "2", "9"]).value).toEqual({ dailyHours: 6.5, workdays: [1, 2] });
    expect(validatePlanning({ dailyHours: "6" }, []).error).toBeTruthy();
    expect(validatePlanning({ dailyHours: "30" }, ["1"]).error).toBeTruthy();
  });
  it("finance converts rupees and percents", () => {
    expect(validateFinance({ minBalance: "25,000", commissionTds: "2", commissionGst: "18" }).value).toEqual({
      minBalancePaise: 2_500_000,
      commissionTdsBps: 200,
      commissionGstBps: 1800,
    });
    expect(validateFinance({ minBalance: "abc" }).error).toBeTruthy();
  });
  it("notifications validate time, email and day", () => {
    expect(validateNotifications({ digestTime: "07:30", digestEmail: "", weeklyReviewDay: "0" }, { emailEnabled: true, pushEnabled: false }).value).toMatchObject({
      digestTime: "07:30",
      pushEnabled: false,
    });
    expect(validateNotifications({ digestTime: "7:30" }, { emailEnabled: true, pushEnabled: true }).error).toBeTruthy();
    expect(validateNotifications({ digestTime: "07:30", digestEmail: "x@" }, { emailEnabled: true, pushEnabled: true }).error).toBeTruthy();
  });
});
