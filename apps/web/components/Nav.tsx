"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  ["/", "The Floor"],
  ["/attacks", "Attack Lab"],
  ["/verify", "Verify it yourself"],
  ["/architecture", "Architecture"],
] as const;

export function Nav() {
  const path = usePathname() ?? "/";
  return (
    <nav className="nav" aria-label="Primary">
      {LINKS.map(([href, label]) => {
        const on = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link key={href} href={href} className={on ? "on" : ""} aria-current={on ? "page" : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
