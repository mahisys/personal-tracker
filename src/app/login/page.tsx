import { redirect } from "next/navigation";
import { getUser, isDevAuth } from "@/server/auth";
import { publicFirebaseConfig } from "@/server/firebase-admin";
import { Aurora } from "@/components/shell/aurora";
import { LoginCard } from "./login-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (isDevAuth() || (await getUser())) redirect("/");
  return (
    <div className="relative flex min-h-dvh items-center justify-center p-4">
      <Aurora />
      <LoginCard config={publicFirebaseConfig()} />
    </div>
  );
}
