import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { getWorkspaceFilter } from "@/server/workspace";
import { editorOptions } from "@/server/invoices/queries";
import { saveInvoice } from "@/server/invoices/actions";
import { emptyRow } from "@/server/invoices/lines";
import { PageHeader } from "@/components/ui/page";
import { DocumentForm } from "@/components/invoices/document-form";
import { addDays, todayIST } from "@/lib/dates";

export const metadata = { title: "New invoice" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ company?: string; project?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const [settings, opts, ws] = await Promise.all([getSettings(), editorOptions(), getWorkspaceFilter()]);
  const b = settings.business;
  const today = todayIST();
  const company = sp.company ? opts.companies.find((c) => c.id === sp.company) : undefined;
  const project = sp.project ? opts.projects.find((p) => p.id === sp.project) : undefined;
  const companyForProject = !company && project?.companyId ? opts.companies.find((c) => c.id === project.companyId) : undefined;
  const c = company ?? companyForProject;

  return (
    <>
      <Link href="/invoices" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Invoices
      </Link>
      <PageHeader eyebrow="New invoice" title="Raise an invoice" description="Pick the client, add what you delivered — GST is worked out as you type." />
      <DocumentForm
        kind="invoice"
        action={saveInvoice}
        sellerStateCode={b.stateCode}
        termDays={b.defaultPaymentTermsDays}
        companies={opts.companies}
        contacts={opts.contacts}
        projects={opts.projects}
        submitLabel="Create invoice"
        initial={{
          workspace: c?.workspace ?? (ws && ws !== "personal" ? ws : "mahisys"),
          companyId: c?.id ?? null,
          projectId: project?.id ?? null,
          billTo: c
            ? { name: c.name, gstin: c.gstin, address: [c.address, c.city].filter((s) => s && s.trim()).join(", "), stateCode: c.stateCode, email: c.email }
            : undefined,
          placeOfSupply: c?.stateCode ?? b.stateCode ?? "",
          issueDate: today,
          endDate: addDays(today, b.defaultPaymentTermsDays),
          terms: b.defaultInvoiceTerms,
          notes: "Thank you for your business!",
          rows: [emptyRow()],
        }}
      />
    </>
  );
}
