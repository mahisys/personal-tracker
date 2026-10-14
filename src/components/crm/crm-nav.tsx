import { SubNav } from "@/components/ui/page";

/** Leads / Contacts / Companies / Stages tabs shared by CRM pages. */
export function CrmNav({ active }: { active: "/crm" | "/crm/contacts" | "/crm/companies" | "/crm/stages" }) {
  return (
    <SubNav
      active={active}
      items={[
        { href: "/crm", label: "Pipeline" },
        { href: "/crm/contacts", label: "Contacts" },
        { href: "/crm/companies", label: "Companies" },
        { href: "/crm/stages", label: "Stages" },
      ]}
    />
  );
}
