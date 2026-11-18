import Link from "next/link";
import { ProjectArt } from "@/components/project-art";
import { getProject, projects, type Project } from "@/content/projects";

export function ProjectPage({
  slug,
  children,
  compact = false,
}: {
  slug: Project["slug"];
  /** The live tool, when the project has one. Replaces the illustration. */
  children?: React.ReactNode;
  /** A one-line header, for tools that need the height to fit on one screen. */
  compact?: boolean;
}) {
  const p = getProject(slug);
  const other =
    projects[
      (projects.findIndex((x) => x.slug === slug) + 1) % projects.length
    ];

  return (
    <div className="mx-auto max-w-[1120px] px-5 sm:px-8">
      {compact ? (
        <section className="pt-6 pb-5">
          <Link href="/#work" className="link rise text-sm text-muted">
            ← All work
          </Link>
          <div
            className="rise mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1"
            style={{ "--i": 1 } as React.CSSProperties}
          >
            <h1 className="display text-[clamp(1.9rem,3.4vw,2.5rem)]">
              {p.name}
            </h1>
            <span className="-translate-y-1 rounded-full bg-accent-soft px-2.5 py-1 font-mono text-[0.68rem] tracking-wide text-accent">
              {p.status}
            </span>
            <p className="font-serif text-[1.15rem] tracking-tight text-muted">
              {p.tagline}
            </p>
          </div>
        </section>
      ) : (
        <section className="pt-14 pb-14 sm:pt-20 sm:pb-16">
          <Link href="/#work" className="link rise text-sm text-muted">
            ← All work
          </Link>
          <div
            className="rise mt-10 flex flex-wrap items-center gap-3"
            style={{ "--i": 1 } as React.CSSProperties}
          >
            <p className="eyebrow">{p.kicker}</p>
            <span className="rounded-full bg-accent-soft px-2.5 py-1 font-mono text-[0.68rem] tracking-wide text-accent">
              {p.status}
            </span>
          </div>
          <h1
            className="display rise mt-5 text-[clamp(2.6rem,6.4vw,4.8rem)]"
            style={{ "--i": 2 } as React.CSSProperties}
          >
            {p.name}
          </h1>
          <p
            className="rise mt-5 max-w-[30ch] font-serif text-[clamp(1.35rem,2.6vw,1.8rem)] leading-snug tracking-tight text-muted"
            style={{ "--i": 3 } as React.CSSProperties}
          >
            {p.tagline}
          </p>
        </section>
      )}

      {children ? (
        <section className="rise" style={{ "--i": 4 } as React.CSSProperties}>
          {children}
        </section>
      ) : (
        <section
          className="rise rounded-2xl border border-line bg-surface px-4 py-8 sm:px-16 sm:py-10"
          style={{ "--i": 4 } as React.CSSProperties}
        >
          <div className="mx-auto max-w-[640px]">
            <ProjectArt slug={p.slug} />
          </div>
        </section>
      )}

      <section className="grid gap-12 py-16 sm:py-20 lg:grid-cols-[2fr_1fr] lg:gap-20">
        <div>
          <p className="eyebrow">{children ? "About this tool" : "Overview"}</p>
          <p className="mt-5 font-serif text-[1.5rem] leading-[1.45] tracking-tight text-ink">
            {p.summary}
          </p>
          <p className="prose-body mt-6">{p.why}</p>

          <p className="eyebrow mt-16">How it works</p>
          <ol className="mt-6">
            {p.steps.map((s, i) => (
              <li
                key={s.title}
                className="grid grid-cols-[3rem_1fr] border-t border-line py-6 last:border-b"
              >
                <span className="pt-1 font-mono text-xs text-signal">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="font-serif text-[1.4rem] leading-snug tracking-tight">
                    {s.title}
                  </h3>
                  <p className="mt-2 leading-relaxed text-muted">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <aside className="space-y-10 lg:pt-1">
          <div>
            <p className="eyebrow">Status</p>
            <p className="mt-4 leading-relaxed text-muted">{p.statusNote}</p>
          </div>
          <div>
            <p className="eyebrow">Stack</p>
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {p.stack.map((s) => (
                <li
                  key={s}
                  className="rounded-full border border-line px-2.5 py-1 font-mono text-[0.7rem] text-muted"
                >
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="eyebrow">Data</p>
            <ul className="mt-4 space-y-1.5 text-[0.95rem] text-muted">
              {p.data.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
          {p.links && (
            <div>
              <p className="eyebrow">Links</p>
              <ul className="mt-4 space-y-1.5 text-[0.95rem]">
                {p.links.map((l) => (
                  <li key={l.href}>
                    <a
                      href={l.href}
                      target="_blank"
                      rel="noreferrer"
                      className="link text-muted"
                    >
                      {l.label} ↗
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </section>

      <section className="border-t border-line py-14">
        <p className="eyebrow">Next project</p>
        <Link
          href={`/work/${other.slug}`}
          className="group mt-4 inline-flex items-baseline gap-3 font-serif text-[clamp(1.8rem,4vw,2.6rem)] tracking-tight"
        >
          {other.name}
          <span
            aria-hidden="true"
            className="text-[0.7em] transition-transform group-hover:translate-x-1"
          >
            →
          </span>
        </Link>
      </section>
    </div>
  );
}
