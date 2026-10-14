import {
  AlarmClock,
  CalendarSync,
  ClipboardCheck,
  FileWarning,
  Hourglass,
  Landmark,
  Phone,
  Receipt,
  Repeat,
  Sunrise,
  Wallet,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import type { RuleMeta } from "@/server/automations/meta";

export const RULE_ICONS: Record<RuleMeta["icon"], LucideIcon> = {
  alarm: AlarmClock,
  sunrise: Sunrise,
  receipt: Receipt,
  phone: Phone,
  hourglass: Hourglass,
  "file-warning": FileWarning,
  landmark: Landmark,
  wallet: Wallet,
  "wallet-cards": WalletCards,
  "calendar-sync": CalendarSync,
  "clipboard-check": ClipboardCheck,
  repeat: Repeat,
};

export const TONE_TILE: Record<RuleMeta["tone"], string> = {
  brand: "text-brand bg-brand-soft",
  good: "text-emerald-600 bg-emerald-500/12 dark:text-emerald-300",
  warn: "text-amber-600 bg-amber-500/14 dark:text-amber-300",
  bad: "text-rose-600 bg-rose-500/12 dark:text-rose-300",
  info: "text-sky-600 bg-sky-500/12 dark:text-sky-300",
  violet: "text-fuchsia-600 bg-fuchsia-500/12 dark:text-fuchsia-300",
};
