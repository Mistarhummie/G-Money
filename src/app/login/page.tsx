import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "./LoginForm";

/** Only same-site paths, so the link can't send people to another website after sign-in. */
function safeNext(next: string | string[] | undefined): string {
  return typeof next === "string" && /^\/(?![\/\\])/.test(next) ? next : "/profile";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const next = safeNext((await searchParams).next);
  if (await getCurrentUser()) redirect(next);
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-1 text-2xl font-bold">Sign in</h1>
      <p className="mb-6 text-sm text-white/70">We&apos;ll text you a 6-digit code. One account per phone number.</p>
      <LoginForm next={next} />
    </div>
  );
}
