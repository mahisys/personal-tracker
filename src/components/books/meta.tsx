import { Banknote, CreditCard, HandCoins, Landmark, Smartphone, Wallet, type LucideIcon } from "lucide-react";
import type { AccountType } from "@/db/schema";
import { cn } from "@/lib/cn";
import { formatINR } from "@/lib/money";
import { ACCOUNT_TYPE_LABEL } from "@/server/books/calc";
import { SubNav } from "@/components/ui/page";

export const ACCOUNT_STYLE: Record<AccountType, { icon: LucideIcon; chip: string; glow: string; bar: string }> = {
  bank: { icon: Landmark, chip: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-300", glow: "from-indigo-500/20", bar: "bg-indigo-500" },
  cash: { icon: Banknote, chip: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300", glow: "from-emerald-500/20", bar: "bg-emerald-500" },
  upi: { icon: Smartphone, chip: "bg-violet-500/12 text-violet-600 dark:text-violet-300", glow: "from-violet-500/20", bar: "bg-violet-500" },
  wallet: { icon: Wallet, chip: "bg-sky-500/12 text-sky-600 dark:text-sky-300", glow: "from-sky-500/20", bar: "bg-sky-500" },
  credit_card: { icon: CreditCard, chip: "bg-rose-500/12 text-rose-600 dark:text-rose-300", glow: "from-rose-500/20", bar: "bg-rose-500" },
  loan: { icon: HandCoins, chip: "bg-amber-500/14 text-amber-700 dark:text-amber-300", glow: "from-amber-500/22", bar: "bg-amber-500" },
};

export function AccountIcon({ type, className }: { type: AccountType; className?: string }) {
  const s = ACCOUNT_STYLE[type];
  const Icon = s.icon;
  return (
    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", s.chip, className)}>
      <Icon className="h-4.5 w-4.5" />
    </span>
  );
}

export function accountTypeLabel(t: AccountType) {
  return ACCOUNT_TYPE_LABEL[t];
}

export function BooksNav({ active }: { active: string }) {
  return (
    <SubNav
      active={active}
      items={[
        { href: "/books", label: "Overview" },
        { href: "/books/transactions", label: "Transactions" },
        { href: "/books/accounts", label: "Accounts" },
        { href: "/books/categories", label: "Categories" },
        { href: "/books/import", label: "Import" },
      ]}
    />
  );
}

/** Signed, coloured money: emerald for money in, rose for money out. */
export function MoneyDelta({ paise, className }: { paise: number; className?: string }) {
  return (
    <span className={cn("font-bold tabular-nums", paise > 0 ? "text-emerald-600 dark:text-emerald-400" : paise < 0 ? "text-rose-600 dark:text-rose-400" : "text-fg-muted", className)}>
      {paise > 0 ? "+" : paise < 0 ? "−" : ""}
      {formatINR(Math.abs(paise))}
    </span>
  );
}
