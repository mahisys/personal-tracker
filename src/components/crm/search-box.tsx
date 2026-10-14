import { Search } from "lucide-react";

/** GET search form that keeps the query in the URL (?q=). */
export function SearchBox({ action, q, placeholder }: { action: string; q?: string | null; placeholder: string }) {
  return (
    <form action={action} className="relative mb-5 max-w-md">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
      <input
        name="q"
        defaultValue={q ?? ""}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-line-strong bg-solid/80 pl-10 pr-3 text-sm text-fg placeholder:text-fg-subtle transition focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
      />
    </form>
  );
}
