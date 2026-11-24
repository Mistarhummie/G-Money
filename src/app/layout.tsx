import type { Metadata, Viewport } from "next";
import { Inter, Nunito } from "next/font/google";
import Image from "next/image";
import { ViewTransition } from "react";
import Link from "next/link";
import { NavLink } from "@/components/NavLink";
import { getDb } from "@/db";
import { needsMe } from "@/lib/challenges";
import { config } from "@/lib/config";
import { accountBalance, ensureTestFunds, walletOf } from "@/lib/wallet";
import { walletPaymentsOn } from "@/lib/wallet-payments";
import { getCurrentUser } from "@/lib/session";
import { signOutAction } from "./actions";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"], weight: ["700", "800", "900"], display: "swap" });

export const metadata: Metadata = {
  title: "G-Money: gaming gift cards",
  description: "Gaming gift cards paid with M-Pesa, plus skill tournaments for Kenyan gamers.",
  manifest: "/manifest.webmanifest",
  applicationName: "G-Money",
  openGraph: { title: "G-Money: gaming gift cards", siteName: "G-Money", images: ["/brand/banner.png"] },
};

export const viewport: Viewport = { themeColor: "#0b1020" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // Challenges sent to you and matches waiting on your move. Checked on page loads only; never breaks the page.
  const waiting = user ? await getDb().then((db) => needsMe(db, user)).catch(() => null) : null;
  const testFunds = config.testFunds();
  const walletOn = walletPaymentsOn();
  const balance =
    user && (testFunds || walletOn)
      ? await getDb()
          .then(async (db) => {
            // Accounts that signed in with a phone (like the admin's) get their test funds on their first visit.
            await ensureTestFunds(db, user.id);
            return accountBalance(db, walletOf(user.id));
          })
          .catch(() => null)
      : null;
  return (
    <html lang="en" className={`${inter.variable} ${nunito.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-10 bg-navy/80 backdrop-blur-md">
          <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
            <Link href="/" className="mr-auto -my-1 shrink-0 transition-opacity hover:opacity-90" aria-label="G-Money home">
              <Image src="/brand/logo-on-dark.svg" alt="G-Money" width={125} height={50} priority className="h-[50px] w-[125px]" />
            </Link>
            <NavLink href="/">Shop</NavLink>
            <NavLink href="/tournaments">Tournaments</NavLink>
            <NavLink href="/play">Games</NavLink>
            <NavLink href="/leaderboards">Leaderboards</NavLink>
            {waiting?.href && (
              <Link
                href={waiting.href}
                className="inline-flex items-center gap-1.5 rounded-full bg-mint px-2.5 py-0.5 text-xs font-bold text-navy transition hover:brightness-110 animate-pop"
                title={waiting.count > 1 ? `${waiting.count} matches need you` : undefined}
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-navy" />
                {waiting.label}
                {waiting.count > 1 && <span className="rounded-full bg-navy/80 px-1.5 text-mint">{waiting.count}</span>}
              </Link>
            )}
            {user && <NavLink href="/orders">My orders</NavLink>}
            {user?.isAdmin && <NavLink href="/admin" className="nav-link !text-lilac">Admin</NavLink>}
            {balance != null && (
              <Link
                href={walletOn ? "/wallet" : "/profile"}
                className="rounded-full border border-mint/40 bg-mint/10 px-2.5 py-0.5 font-display text-xs font-extrabold text-mint transition hover:bg-mint/20"
                title={testFunds ? "Test funds: not real money" : "Your wallet"}
              >
                KES {balance.toLocaleString()}
              </Link>
            )}
            {user ? (
              <>
                <NavLink href="/profile">{user.username ?? "Profile"}</NavLink>
                <form action={signOutAction}>
                  <button className="text-white/60 transition-colors hover:text-white">Sign out</button>
                </form>
              </>
            ) : (
              <Link href="/login" className="btn-primary !py-1.5">{testFunds ? "Join" : "Sign in"}</Link>
            )}
          </nav>
          <div className="glow-line" />
        </header>
        {testFunds && !user && (
          <div className="bg-violet-600/20 px-4 py-2 text-center text-sm text-lilac">
            Test site: <Link href="/login" className="font-semibold underline">pick a username</Link> and get KES{" "}
            {config.testFundsKes.toLocaleString()} in test funds to play other people live.
          </div>
        )}
        {user?.bannedAt && (
          <div className="bg-red-500/15 px-4 py-2 text-center text-sm text-red-200">
            Your account is suspended: {user.banReason}. Contact support to appeal.
          </div>
        )}
        <ViewTransition default="page">
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
        </ViewTransition>
        <div className="glow-line opacity-60" />
        <footer className="px-4 py-8 text-center text-xs text-white/50">
          <Image src="/brand/icon.svg" alt="" width={32} height={32} className="mx-auto mb-3 h-8 w-8 rounded-lg" />
          Gift cards from authorised distributors. Tournaments are skill games only. 18+.
        </footer>
      </body>
    </html>
  );
}
