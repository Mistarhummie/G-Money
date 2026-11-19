"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** A header link that underlines itself when you are on its page. */
export function NavLink({ href, children, className = "nav-link" }: { href: string; children: React.ReactNode; className?: string }) {
  const path = usePathname();
  const active = href === "/" ? path === "/" || path.startsWith("/shop") : path === href || path.startsWith(`${href}/`);
  return (
    <Link href={href} className={className} aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}
