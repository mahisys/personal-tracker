"use client";
import { Moon, Sun } from "lucide-react";

/** Toggles the `dark` class on <html>; icons swap through `dark:` variants, so no state is needed. */
export function ThemeToggle() {
  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
  };
  return (
    <button type="button" onClick={toggle} aria-label="Toggle dark mode" className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl text-fg-muted transition hover:bg-brand-soft hover:text-fg">
      <Sun className="absolute h-[18px] w-[18px] rotate-0 scale-100 opacity-100 transition-all duration-500 dark:rotate-90 dark:scale-0 dark:opacity-0" />
      <Moon className="absolute h-[18px] w-[18px] -rotate-90 scale-0 opacity-0 transition-all duration-500 dark:rotate-0 dark:scale-100 dark:opacity-100" />
    </button>
  );
}
