"use client";
import { useState } from "react";
import { Check, Copy, MessageCircle, Mail } from "lucide-react";
import { toast } from "sonner";
import { buttonClass } from "@/components/ui/button";

/** Copies a polite payment reminder; offers WhatsApp and email shortcuts when we have the details. */
export function ReminderButton({ text, waLink, email, subject }: { text: string; waLink: string | null; email: string | null; subject: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Reminder copied — paste it anywhere");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select the text and copy it manually");
    }
  }
  return (
    <div className="space-y-3">
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-muted/60 p-3 font-sans text-xs leading-relaxed text-fg">{text}</pre>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className={buttonClass("secondary", "sm")}>
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy reminder"}
        </button>
        {waLink ? (
          <a href={waLink} target="_blank" rel="noreferrer" className={buttonClass("success", "sm")}>
            <MessageCircle className="h-3.5 w-3.5" /> Send on WhatsApp
          </a>
        ) : null}
        {email ? (
          <a href={`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`} className={buttonClass("soft", "sm")}>
            <Mail className="h-3.5 w-3.5" /> Email
          </a>
        ) : null}
      </div>
    </div>
  );
}
