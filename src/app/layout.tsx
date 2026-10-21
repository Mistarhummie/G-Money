import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { signOutAction } from "./actions";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "G-Money: gaming gift cards",
  description: "Gaming gift cards paid with M-Pesa, plus skill tournaments for Kenyan gamers.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#07130e" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-10 border-b border-white/10 bg-[#07130e]/90 backdrop-blur">
          <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
            <Link href="/" className="mr-auto text-lg font-bold tracking-tight">
              G<span className="text-emerald-400">-Money</span>
            </Link>
            <Link href="/" className="text-white/80 hover:text-white">Shop</Link>
            <Link href="/tournaments" className="text-white/80 hover:text-white">Tournaments</Link>
            <Link href="/play" className="text-white/80 hover:text-white">Games</Link>
            {user && <Link href="/orders" className="text-white/80 hover:text-white">My orders</Link>}
            {user?.isAdmin && <Link href="/admin" className="text-amber-300 hover:text-amber-200">Admin</Link>}
            {user ? (
              <>
                <Link href="/profile" className="text-white/80 hover:text-white">{user.username ?? "Profile"}</Link>
                <form action={signOutAction}>
                  <button className="text-white/60 hover:text-white">Sign out</button>
                </form>
              </>
            ) : (
              <Link href="/login" className="btn-primary !py-1.5">Sign in</Link>
            )}
          </nav>
        </header>
        {user?.bannedAt && (
          <div className="bg-red-500/15 px-4 py-2 text-center text-sm text-red-200">
            Your account is suspended: {user.banReason}. Contact support to appeal.
          </div>
        )}
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-white/10 px-4 py-6 text-center text-xs text-white/50">
          Gift cards from authorised distributors. Tournaments are skill games only. 18+.
        </footer>
      </body>
    </html>
  );
}
