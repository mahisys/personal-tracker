"use client";
import { useEffect } from "react";
import { celebrate } from "@/components/client/celebrate";

/** Fires confetti once per key (e.g. "budget-2026-09") when a budget goal was hit. */
export function CelebrateOnce({ storageKey }: { storageKey: string }) {
  useEffect(() => {
    try {
      if (window.localStorage.getItem(storageKey)) return;
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // storage blocked: still celebrate, just maybe more than once
    }
    const t = setTimeout(celebrate, 400);
    return () => clearTimeout(t);
  }, [storageKey]);
  return null;
}
