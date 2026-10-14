import {
  Banknote,
  Bell,
  BookOpen,
  Briefcase,
  CalendarClock,
  ChartColumnBig,
  CheckSquare,
  FileText,
  FolderKanban,
  Handshake,
  Landmark,
  Settings,
  Sparkles,
  Sun,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; group: string };

export const NAV: NavItem[] = [
  { href: "/", label: "Today", icon: Sun, group: "Focus" },
  { href: "/tasks", label: "Tasks", icon: CheckSquare, group: "Focus" },
  { href: "/projects", label: "Projects", icon: FolderKanban, group: "Focus" },
  { href: "/crm", label: "CRM", icon: Users, group: "MahiSys" },
  { href: "/sales", label: "Sales", icon: Handshake, group: "MahiSys" },
  { href: "/invoices", label: "Invoices", icon: FileText, group: "MahiSys" },
  { href: "/dsa", label: "DSA desk", icon: Landmark, group: "Loan DSA" },
  { href: "/books", label: "Books", icon: BookOpen, group: "Money" },
  { href: "/planner", label: "Planner", icon: CalendarClock, group: "Money" },
  { href: "/reports", label: "Reports", icon: ChartColumnBig, group: "Insights" },
  { href: "/automations", label: "Automations", icon: Workflow, group: "Insights" },
  { href: "/notifications", label: "Alerts", icon: Bell, group: "Insights" },
  { href: "/settings", label: "Settings", icon: Settings, group: "Insights" },
];

/** Bottom tab bar on phones */
export const MOBILE_NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Today", icon: Sun },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/crm", label: "CRM", icon: Briefcase },
  { href: "/dsa", label: "DSA", icon: Landmark },
  { href: "/books", label: "Money", icon: Banknote },
];

export const BRAND = { name: "Command Center", tagline: "MahiSys", icon: Sparkles };
