"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { PublicFirebaseConfig } from "@/server/firebase-admin";
import { firebaseApp } from "@/lib/client/firebase";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";

export function LoginCard({ config }: { config: PublicFirebaseConfig }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"google" | "email" | null>(null);
  const configured = Boolean(config.apiKey);

  async function finish(idToken: string) {
    const res = await fetch("/api/auth/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken }) });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Sign-in failed" }));
      throw new Error(error);
    }
    router.replace("/");
    router.refresh();
  }

  async function google() {
    setBusy("google");
    try {
      const { getAuth, GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
      const cred = await signInWithPopup(getAuth(firebaseApp(config)), new GoogleAuthProvider());
      await finish(await cred.user.getIdToken());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sign-in failed");
      setBusy(null);
    }
  }

  async function email(form: FormData) {
    setBusy("email");
    try {
      const { getAuth, signInWithEmailAndPassword } = await import("firebase/auth");
      const cred = await signInWithEmailAndPassword(getAuth(firebaseApp(config)), String(form.get("email")), String(form.get("password")));
      await finish(await cred.user.getIdToken());
    } catch (e) {
      toast.error(e instanceof Error ? e.message.replace("Firebase: ", "") : "Sign-in failed");
      setBusy(null);
    }
  }

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className="glass w-full max-w-md rounded-[2rem] border border-line p-8 shadow-pop sm:p-10"
    >
      <motion.div
        initial={{ rotate: -20, scale: 0.6 }}
        animate={{ rotate: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 12, delay: 0.1 }}
        className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--brand),var(--brand-2)_60%,#22c1a3)] text-white shadow-[0_14px_30px_-12px_var(--brand)]"
      >
        <Sparkles className="h-7 w-7" />
      </motion.div>
      <h1 className="text-3xl font-extrabold tracking-tight">
        <span className="text-gradient">{greet}.</span>
      </h1>
      <p className="mt-2 text-sm text-fg-muted">Sign in to your Command Center — everything for Personal, MahiSys and Loan DSA in one calm place.</p>

      {!configured ? (
        <p className="mt-6 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
          Sign-in is not configured yet. Set the FIREBASE_* environment variables (see DEPLOY.md).
        </p>
      ) : (
        <>
          <Button variant="secondary" size="lg" className="mt-8 w-full" onClick={google} disabled={busy !== null}>
            {busy === "google" ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleMark />}
            Continue with Google
          </Button>
          <div className="my-6 flex items-center gap-3 text-xs font-semibold text-fg-subtle">
            <span className="h-px flex-1 bg-line-strong" /> or with email <span className="h-px flex-1 bg-line-strong" />
          </div>
          <form action={email} className="space-y-4">
            <Field label="Email">
              <Input name="email" type="email" autoComplete="email" required />
            </Field>
            <Field label="Password">
              <Input name="password" type="password" autoComplete="current-password" required />
            </Field>
            <Button type="submit" size="lg" className="w-full" disabled={busy !== null}>
              {busy === "email" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Sign in
            </Button>
          </form>
        </>
      )}
    </motion.div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
    </svg>
  );
}
