import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { site } from "@/content/site";

const nav = [
  { href: "/#work", label: "Work" },
  { href: "/about", label: "About" },
  { href: "/#contact", label: "Contact" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-5 sm:px-8">
        <Link
          href="/"
          className="font-serif text-[1.15rem] tracking-tight whitespace-nowrap text-ink sm:text-[1.3rem]"
        >
          {site.name}
        </Link>
        <nav className="flex items-center sm:gap-2" aria-label="Main">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-2 py-1.5 text-sm sm:px-3 text-muted transition-colors hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
