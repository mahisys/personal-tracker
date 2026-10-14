import { describe, expect, it } from "vitest";
import {
  batchImportHashes,
  detectDateFormat,
  guessMapping,
  importHash,
  normaliseRows,
  parseCsv,
  parseStatementAmount,
  parseStatementDate,
  suggestCategory,
  suggestWorkspace,
} from "./import";

describe("parseCsv", () => {
  it("skips the preamble lines before the table header", () => {
    const text = [
      "﻿Account Statement",
      "Account No: XXXX1234",
      "",
      "Date,Narration,Ref No,Withdrawal Amt,Deposit Amt,Closing Balance",
      '01/10/2026,UPI-SWIGGY,123,450.00,,"1,00,000.00"',
      '02/10/2026,NEFT CR-ACME,456,,"25,000.00","1,25,000.00"',
      "",
    ].join("\n");
    const out = parseCsv(text);
    expect(out.headers).toEqual(["Date", "Narration", "Ref No", "Withdrawal Amt", "Deposit Amt", "Closing Balance"]);
    expect(out.rows).toHaveLength(2);
    expect(out.rows[1][4]).toBe("25,000.00");
  });

  it("pads short rows to the table width", () => {
    const out = parseCsv("Date,Desc,Amount,Bal\n2026-10-01,Coffee,-120,\n2026-10-02,Tea,-80,500\n2026-10-03,Lunch,-200,300");
    expect(out.rows[0]).toEqual(["2026-10-01", "Coffee", "-120", ""]);
  });

  it("returns empty for blank input", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
  });
});

describe("parseStatementDate", () => {
  it("parses every supported format", () => {
    expect(parseStatementDate("14/10/2026", "DD/MM/YYYY")).toBe("2026-10-14");
    expect(parseStatementDate("4/1/26", "DD/MM/YYYY")).toBe("2026-01-04");
    expect(parseStatementDate("14-10-2026", "DD-MM-YYYY")).toBe("2026-10-14");
    expect(parseStatementDate("14.10.2026", "DD-MM-YYYY")).toBe("2026-10-14");
    expect(parseStatementDate("2026-10-14", "YYYY-MM-DD")).toBe("2026-10-14");
    expect(parseStatementDate("14 Oct 2026", "DD MMM YYYY")).toBe("2026-10-14");
    expect(parseStatementDate("05-Sep-26", "DD MMM YYYY")).toBe("2026-09-05");
    expect(parseStatementDate("5 September 2026", "DD MMM YYYY")).toBe("2026-09-05");
  });

  it("ignores a trailing time", () => {
    expect(parseStatementDate("14/10/2026 10:32:11", "DD/MM/YYYY")).toBe("2026-10-14");
  });

  it("rejects impossible dates and wrong formats", () => {
    expect(parseStatementDate("31/02/2026", "DD/MM/YYYY")).toBeNull();
    expect(parseStatementDate("2026-10-14", "DD/MM/YYYY")).toBeNull();
    expect(parseStatementDate("14 Foo 2026", "DD MMM YYYY")).toBeNull();
    expect(parseStatementDate("", "YYYY-MM-DD")).toBeNull();
  });

  it("detects the format from samples", () => {
    expect(detectDateFormat(["01/10/2026", "15/10/2026"])).toBe("DD/MM/YYYY");
    expect(detectDateFormat(["01-10-2026", "15-10-2026"])).toBe("DD-MM-YYYY");
    expect(detectDateFormat(["2026-10-01"])).toBe("YYYY-MM-DD");
    expect(detectDateFormat(["01 Oct 2026", "02 Oct 2026"])).toBe("DD MMM YYYY");
  });
});

describe("parseStatementAmount", () => {
  it("handles Indian grouping, currency marks and signs", () => {
    expect(parseStatementAmount("1,23,456.78")).toBe(12345678);
    expect(parseStatementAmount("₹ 500")).toBe(50000);
    expect(parseStatementAmount("Rs. 99.5")).toBe(9950);
    expect(parseStatementAmount("-250.00")).toBe(-25000);
    expect(parseStatementAmount("(1,000.00)")).toBe(-100000);
    expect(parseStatementAmount("250.00-")).toBe(-25000);
    expect(parseStatementAmount("1,500.00 Dr")).toBe(-150000);
    expect(parseStatementAmount("1,500.00 Cr")).toBe(150000);
    expect(parseStatementAmount("+75")).toBe(7500);
  });
  it("returns null for blanks and junk", () => {
    expect(parseStatementAmount("")).toBeNull();
    expect(parseStatementAmount("-")).toBeNull();
    expect(parseStatementAmount("abc")).toBeNull();
    expect(parseStatementAmount(null)).toBeNull();
  });
});

describe("normaliseRows", () => {
  it("uses debit/credit columns", () => {
    const rows = [
      ["01/10/2026", "UPI-SWIGGY  ORDER", "450.00", ""],
      ["02/10/2026", "NEFT CR ACME", "", "25,000.00"],
      ["03/10/2026", "Opening", "", ""],
      ["xx", "Bad date", "10", ""],
    ];
    const lines = normaliseRows(rows, { date: 0, description: 1, dateFormat: "DD/MM/YYYY", amountMode: "split", debit: 2, credit: 3 });
    expect(lines[0]).toMatchObject({ date: "2026-10-01", description: "UPI-SWIGGY ORDER", amountPaise: 45000, type: "expense", error: null });
    expect(lines[1]).toMatchObject({ amountPaise: 2500000, type: "income", error: null });
    expect(lines[2].error).toBe("No amount");
    expect(lines[3].error).toBe("Date not recognised");
  });

  it("uses a signed amount column, optionally inverted", () => {
    const rows = [
      ["2026-10-01", "Coffee", "-120"],
      ["2026-10-02", "Refund", "300"],
    ];
    const base = { date: 0, description: 1, dateFormat: "YYYY-MM-DD" as const, amountMode: "signed" as const, amount: 2 };
    const a = normaliseRows(rows, base);
    expect(a.map((l) => [l.type, l.amountPaise])).toEqual([["expense", 12000], ["income", 30000]]);
    const b = normaliseRows(rows, { ...base, invertSign: true });
    expect(b.map((l) => l.type)).toEqual(["income", "expense"]);
  });
});

describe("suggestCategory", () => {
  const cats = [
    { id: "food", kind: "expense" as const, matchKeywords: ["swiggy", "zomato"] },
    { id: "card", kind: "expense" as const, matchKeywords: ["card"] },
    { id: "ccpay", kind: "expense" as const, matchKeywords: ["credit card"] },
    { id: "sales", kind: "income" as const, matchKeywords: ["neft cr"] },
    { id: "old", kind: "expense" as const, matchKeywords: ["uber"], archived: true },
  ];
  it("matches case-insensitively by kind", () => {
    expect(suggestCategory("UPI/SWIGGY/Bangalore", "expense", cats)?.id).toBe("food");
    expect(suggestCategory("NEFT CR-ACME LTD", "income", cats)?.id).toBe("sales");
    expect(suggestCategory("NEFT CR-ACME LTD", "expense", cats)).toBeNull();
  });
  it("prefers the longest keyword and skips archived", () => {
    expect(suggestCategory("HDFC CREDIT CARD PAYMENT", "expense", cats)?.id).toBe("ccpay");
    expect(suggestCategory("UBER TRIP", "expense", cats)).toBeNull();
  });
  it("suggests a workspace", () => {
    expect(suggestWorkspace("dsa", "personal", "mahisys")).toBe("dsa");
    expect(suggestWorkspace(null, "personal", "mahisys")).toBe("personal");
    expect(suggestWorkspace(null, null, "mahisys")).toBe("mahisys");
  });
});

describe("import hashes", () => {
  it("is stable and sensitive to every part", () => {
    const h = importHash("acc", "2026-10-01", -45000, "UPI SWIGGY");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(importHash("acc", "2026-10-01", -45000, "  upi   swiggy ")).toBe(h);
    expect(importHash("acc2", "2026-10-01", -45000, "UPI SWIGGY")).not.toBe(h);
    expect(importHash("acc", "2026-10-02", -45000, "UPI SWIGGY")).not.toBe(h);
    expect(importHash("acc", "2026-10-01", 45000, "UPI SWIGGY")).not.toBe(h);
  });
  it("keeps two identical lines in one file distinct", () => {
    const line = { date: "2026-10-01", amountPaise: 1000, type: "expense" as const, description: "SMS CHARGES" };
    const [a, b] = batchImportHashes("acc", [line, line]);
    expect(a).not.toBe(b);
    expect(a).toBe(importHash("acc", "2026-10-01", -1000, "SMS CHARGES"));
    expect(batchImportHashes("acc", [line, line])).toEqual([a, b]);
  });
});

describe("guessMapping", () => {
  it("guesses split debit/credit columns from common bank headers", () => {
    const m = guessMapping(["Txn Date", "Description", "Ref No./Cheque No.", "Debit", "Credit", "Balance"], [["01 Oct 2026", "x", "1", "10", "", "5"]]);
    expect(m).toMatchObject({ date: 0, description: 1, amountMode: "split", debit: 3, credit: 4, reference: 2, dateFormat: "DD MMM YYYY" });
  });
  it("falls back to a signed amount column", () => {
    const m = guessMapping(["Date", "Narration", "Amount"], [["2026-10-01", "x", "-5"]]);
    expect(m).toMatchObject({ amountMode: "signed", amount: 2, dateFormat: "YYYY-MM-DD" });
  });
});
