/** Polite payment-reminder text (pure). */
import { formatDay } from "@/lib/dates";
import { formatINR } from "@/lib/money";

export function buildPaymentReminder(p: {
  clientName: string;
  contactName?: string | null;
  number: string;
  balancePaise: number;
  dueDate: string;
  today: string;
  businessName: string;
  upiId?: string | null;
}): string {
  const greet = p.contactName ? `Hi ${p.contactName.split(" ")[0]},` : `Dear ${p.clientName} team,`;
  const due =
    p.dueDate < p.today
      ? `was due on ${formatDay(p.dueDate)}`
      : p.dueDate === p.today
        ? `is due today (${formatDay(p.dueDate)})`
        : `is due on ${formatDay(p.dueDate)}`;
  const lines = [
    greet,
    "",
    `Hope you're doing well. This is a gentle reminder that invoice ${p.number} for ${formatINR(p.balancePaise)} ${due}.`,
    "",
    p.upiId ? `You can pay by bank transfer or UPI (${p.upiId}).` : "You can pay by bank transfer using the details on the invoice.",
    "If you've already made the payment, please ignore this message — and thank you!",
    "",
    "Warm regards,",
    p.businessName,
  ];
  return lines.join("\n");
}

/** wa.me link for an Indian phone number (adds 91 for 10-digit numbers). Null when there is no usable number. */
export function whatsappLink(phone: string | null | undefined, text?: string): string | null {
  const digits = waDigits(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function waDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("0") && d.length === 11) d = d.slice(1);
  if (d.length === 10) d = `91${d}`;
  return d.length >= 10 ? d : null;
}
