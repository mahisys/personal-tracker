"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";

/**
 * Instant search box: updates ?q= after a short pause (debounced) so results stream in as you type.
 * "/" focuses it from anywhere on the page; ↓ moves into the results; Esc clears.
 */
export function SearchBox({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLInputElement>(null);
  const last = useRef(initial);

  useEffect(() => {
    const v = value.trim();
    if (v === last.current) return;
    const t = setTimeout(() => {
      last.current = v;
      start(() => router.replace(v ? `${pathname}?q=${encodeURIComponent(v)}` : pathname, { scroll: false }));
    }, 220);
    return () => clearTimeout(t);
  }, [value, pathname, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-subtle" />
      <input
        ref={ref}
        autoFocus
        type="search"
        role="searchbox"
        aria-label="Search everything"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setValue("");
          if (e.key === "ArrowDown") {
            const first = document.querySelector<HTMLAnchorElement>("[data-search-result]");
            if (first) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
        placeholder="Search leads, borrowers, invoices, phone numbers, GSTINs…"
        className="glass h-14 w-full rounded-2xl border border-line-strong pl-12 pr-12 text-base text-fg shadow-card placeholder:text-fg-subtle transition focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 [&::-webkit-search-cancel-button]:hidden"
      />
      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center">
        {pending ? (
          <Loader2 className="h-5 w-5 animate-spin text-brand" />
        ) : value ? (
          <button
            type="button"
            onClick={() => {
              setValue("");
              ref.current?.focus();
            }}
            aria-label="Clear search"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle transition hover:bg-muted hover:text-fg"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <kbd className="hidden rounded-md border border-line-strong px-1.5 py-0.5 text-[11px] font-bold text-fg-subtle sm:block">/</kbd>
        )}
      </div>
    </div>
  );
}

/** Arrow-key navigation between result links. */
export function ResultsKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const items = Array.from(document.querySelectorAll<HTMLAnchorElement>("[data-search-result]"));
      const i = items.indexOf(document.activeElement as HTMLAnchorElement);
      if (i === -1) return;
      e.preventDefault();
      if (e.key === "ArrowDown") items[Math.min(items.length - 1, i + 1)]?.focus();
      else if (i === 0) document.querySelector<HTMLInputElement>('[role="searchbox"]')?.focus();
      else items[i - 1]?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
