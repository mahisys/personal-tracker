import { Mail, MessageCircle, Phone } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

/** wa.me needs the number with country code and no symbols; assume India for 10-digit numbers. */
export function waNumber(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`;
  return d;
}

export function ContactLinks({ phone, email, waText }: { phone?: string | null; email?: string | null; waText?: string }) {
  if (!phone && !email) return <p className="text-xs text-fg-subtle">No contact details yet.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {phone ? (
        <>
          <a href={`tel:${phone.replace(/\s/g, "")}`} className={buttonClass("secondary", "sm")}>
            <Phone className="h-3.5 w-3.5" /> Call
          </a>
          <a
            href={`https://wa.me/${waNumber(phone)}${waText ? `?text=${encodeURIComponent(waText)}` : ""}`}
            target="_blank"
            rel="noreferrer"
            className={buttonClass("secondary", "sm", "text-emerald-700 dark:text-emerald-300")}
          >
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </a>
        </>
      ) : null}
      {email ? (
        <a href={`mailto:${email}`} className={buttonClass("secondary", "sm")}>
          <Mail className="h-3.5 w-3.5" /> Email
        </a>
      ) : null}
    </div>
  );
}
