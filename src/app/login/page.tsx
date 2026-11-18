import Link from "next/link";
import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { getCurrentUser } from "@/lib/session";
import { JoinForm } from "./JoinForm";
import { LoginForm } from "./LoginForm";

/** Only same-site paths, so the link can't send people to another website after sign-in. */
function safeNext(next: string | string[] | undefined, fallback: string): string {
  return typeof next === "string" && /^\/(?![\/\\])/.test(next) ? next : fallback;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; phone?: string }>;
}) {
  const params = await searchParams;
  // Test sites let people in with just a username; phone sign-in stays for the admin.
  const join = config.testFunds() && !params.phone;
  const next = safeNext(params.next, join ? "/play" : "/profile");
  if (await getCurrentUser()) redirect(next);
  if (join) {
    return (
      <div className="mx-auto max-w-sm">
        <h1 className="mb-1 text-2xl font-bold">Pick a username</h1>
        <p className="mb-6 text-sm text-white/70">
          This is a test site. You get KES {config.testFundsKes.toLocaleString()} in test funds to play other people live. It&apos;s
          not real money.
        </p>
        <JoinForm next={next} funds={config.testFundsKes} />
        <p className="mt-6 text-center text-xs text-white/50">
          <Link href={`/login?phone=1&next=${encodeURIComponent(next)}`} className="underline">
            Sign in with a phone number instead
          </Link>
        </p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-1 text-2xl font-bold">Sign in</h1>
      <p className="mb-6 text-sm text-white/70">We&apos;ll text you a 6-digit code. One account per phone number.</p>
      <LoginForm next={next} />
    </div>
  );
}
