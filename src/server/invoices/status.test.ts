import { describe, expect, it } from "vitest";
import { deriveInvoiceStatus, matchesTab } from "./status";

const today = "2026-10-14";
const base = { status: "sent" as const, totalPaise: 10000, paidPaise: 0, dueDate: "2026-10-20" };

describe("deriveInvoiceStatus", () => {
  it("is paid once payments cover the total", () => {
    expect(deriveInvoiceStatus({ ...base, paidPaise: 10000 }, today)).toBe("paid");
    expect(deriveInvoiceStatus({ ...base, status: "part_paid", paidPaise: 12000 }, today)).toBe("paid");
  });
  it("is overdue when past due with a balance and sent / part paid", () => {
    expect(deriveInvoiceStatus({ ...base, dueDate: "2026-10-13" }, today)).toBe("overdue");
    expect(deriveInvoiceStatus({ ...base, status: "part_paid", paidPaise: 5000, dueDate: "2026-10-01" }, today)).toBe("overdue");
  });
  it("is not overdue on the due date itself, nor for drafts", () => {
    expect(deriveInvoiceStatus({ ...base, dueDate: today }, today)).toBe("sent");
    expect(deriveInvoiceStatus({ ...base, status: "draft", dueDate: "2026-01-01" }, today)).toBe("draft");
  });
  it("keeps cancelled", () => {
    expect(deriveInvoiceStatus({ ...base, status: "cancelled", dueDate: "2026-01-01" }, today)).toBe("cancelled");
  });
  it("maps to tabs", () => {
    expect(matchesTab("overdue", "unpaid")).toBe(true);
    expect(matchesTab("part_paid", "unpaid")).toBe(true);
    expect(matchesTab("paid", "unpaid")).toBe(false);
    expect(matchesTab("draft", "all")).toBe(true);
  });
});
