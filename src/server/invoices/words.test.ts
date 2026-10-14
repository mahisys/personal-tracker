import { describe, expect, it } from "vitest";
import { amountInWords, numberToIndianWords } from "./words";

describe("amountInWords (Indian numbering)", () => {
  it("handles lakh, thousand and paise", () => {
    expect(amountInWords(125000050)).toBe("Rupees Twelve Lakh Fifty Thousand and Fifty Paise Only");
  });
  it("handles crore and hundreds", () => {
    expect(amountInWords(1234567800)).toBe("Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Only");
  });
  it("handles whole rupees, zero and paise only", () => {
    expect(amountInWords(100)).toBe("Rupees One Only");
    expect(amountInWords(0)).toBe("Rupees Zero Only");
    expect(amountInWords(99)).toBe("Ninety Nine Paise Only");
    expect(amountInWords(11800000)).toBe("Rupees One Lakh Eighteen Thousand Only");
  });
  it("handles very large crore values", () => {
    expect(numberToIndianWords(1_250_000_000)).toBe("One Hundred Twenty Five Crore");
    expect(numberToIndianWords(19)).toBe("Nineteen");
    expect(numberToIndianWords(1010)).toBe("One Thousand Ten");
  });
});
