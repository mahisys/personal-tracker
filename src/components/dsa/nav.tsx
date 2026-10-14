import { SubNav } from "@/components/ui/page";

const ITEMS = [
  { href: "/dsa", label: "Desk" },
  { href: "/dsa/payouts", label: "Payouts & earnings" },
  { href: "/dsa/borrowers", label: "Borrowers" },
  { href: "/dsa/lenders", label: "Lenders" },
  { href: "/dsa/partners", label: "Partners" },
];

export function DsaNav({ active, counts }: { active: string; counts?: Partial<Record<string, number>> }) {
  return <SubNav active={active} items={ITEMS.map((i) => ({ ...i, count: counts?.[i.href] }))} />;
}
