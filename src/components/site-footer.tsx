import { site } from "@/content/site";

export function SiteFooter() {
  const links = [
    { label: "Email", href: `mailto:${site.email}` },
    site.links.github && { label: "GitHub", href: site.links.github },
    site.links.linkedin && { label: "LinkedIn", href: site.links.linkedin },
  ].filter(Boolean) as { label: string; href: string }[];

  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-4 px-5 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>
          {site.name} · {site.location}
        </p>
        <ul className="flex gap-6">
          {links.map((l) => (
            <li key={l.label}>
              <a className="link" href={l.href}>
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
