import Link from "next/link";
import { TerrainBackdrop } from "@/components/sculpture/terrain-band";
import { ProjectArt } from "@/components/project-art";
import { experience } from "@/content/experience";
import { projects } from "@/content/projects";
import { site } from "@/content/site";

export default function Home() {
  return (
    <>
      {/* Hero: the terrain fills the upper part and the text sits at the lower
          left. The text wrapper lets the pointer through its empty areas so
          the terrain behind stays clickable. */}
      <section className="relative overflow-hidden">
        <TerrainBackdrop />
        <div className="pointer-events-none relative z-10 mx-auto flex min-h-[calc(100svh-4rem)] max-w-[1120px] flex-col justify-end px-5 pt-[40svh] pb-10 sm:px-8 lg:pt-24 lg:pb-7 [&>*]:pointer-events-auto">
          {/* A soft patch of the page colour behind the text, so ridges that
              reach this far never cut through the words. */}
          <div
            aria-hidden="true"
            className="!pointer-events-none absolute -inset-x-6 top-[34svh] bottom-0 -z-10 bg-[radial-gradient(ellipse_85%_115%_at_28%_65%,var(--paper)_58%,transparent_100%)] lg:top-[36%] lg:right-[44%]"
          />
          <p className="eyebrow rise">
            {site.role} · {site.location}
          </p>
          <h1
            className="display rise mt-5 max-w-[16ch] text-[clamp(2.1rem,4.4vw,3.5rem)]"
            style={{ "--i": 1 } as React.CSSProperties}
          >
            I build data tools that explain <em>why</em> the numbers moved.
          </h1>
          <p
            className="prose-body rise mt-5 max-w-[46ch] text-[1rem]"
            style={{ "--i": 2 } as React.CSSProperties}
          >
            I&rsquo;m a data scientist at Uber working on people analytics and
            corporate operations. Before that I worked on telehealth at Amazon,
            hospital quality at Kaiser Permanente, and global health research at
            IHME. My work combines statistical modeling, data pipelines, and
            interactive visualization, and more recently LLM-powered analytics
            products.
          </p>
          <div
            className="rise mt-7 flex flex-wrap gap-3"
            style={{ "--i": 3 } as React.CSSProperties}
          >
            <Link
              href="/#work"
              className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-85"
            >
              See the work
            </Link>
            <Link
              href="/about"
              className="rounded-full border border-line px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-ink"
            >
              About me
            </Link>
          </div>
        </div>
        {/* Cards for the terrain's change points are drawn here, above the text. */}
        <div
          id="terrain-cards"
          className="pointer-events-none absolute inset-0 z-20"
        />
        {/* The story for the highlighted change point is docked at the lower
            right, below the terrain, in line with the page's right edge. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-8 z-20 mx-auto max-w-[1120px] px-5 sm:px-8 lg:bottom-7">
          <div id="terrain-story" className="ml-auto w-[21rem]" />
        </div>
      </section>

      <div className="mx-auto max-w-[1120px] px-5 sm:px-8">
        {/* Work */}
        <section id="work" className="border-t border-line py-20 sm:py-28">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Selected work</p>
              <h2 className="display mt-4 text-[clamp(2rem,4.4vw,3.1rem)]">
                Projects you can open and use
              </h2>
            </div>
            <p className="max-w-[40ch] text-sm leading-relaxed text-muted">
              Four interactive tools, built in the open and all in beta. Each
              page explains the design.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {projects.map((p) => (
              <Link
                key={p.slug}
                href={`/work/${p.slug}`}
                className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-colors hover:border-ink/40"
              >
                <div className="border-b border-line px-4 pt-6 pb-2">
                  <ProjectArt slug={p.slug} />
                </div>
                <div className="flex flex-1 flex-col p-6 sm:p-7">
                  <div className="flex items-center justify-between gap-4">
                    <p className="eyebrow">{p.kicker.split(" · ")[0]}</p>
                    <span className="rounded-full bg-accent-soft px-2.5 py-1 font-mono text-[0.68rem] tracking-wide text-accent">
                      {p.status}
                    </span>
                  </div>
                  <h3 className="mt-4 font-serif text-[1.9rem] leading-tight tracking-tight">
                    {p.name}
                  </h3>
                  <p className="mt-3 flex-1 leading-relaxed text-muted">
                    {p.tagline}
                  </p>
                  <p className="mt-6 flex items-center gap-2 text-sm font-medium text-ink">
                    {p.cta}
                    <span
                      aria-hidden="true"
                      className="transition-transform group-hover:translate-x-1"
                    >
                      →
                    </span>
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Experience */}
        <section className="border-t border-line py-20 sm:py-28">
          <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
            <div>
              <p className="eyebrow">Experience</p>
              <h2 className="display mt-4 text-[clamp(2rem,4.4vw,3.1rem)]">
                More than a decade across tech and health
              </h2>
              <Link href="/about" className="link mt-6 inline-block text-sm">
                Full background and publications
              </Link>
            </div>
            <ol>
              {experience.map((role) => (
                <li
                  key={role.company}
                  className="grid gap-x-8 gap-y-1 border-t border-line py-6 first:border-t-0 first:pt-0 sm:grid-cols-[8.5rem_1fr]"
                >
                  <p className="pt-1 font-mono text-xs text-muted">
                    {role.years}
                  </p>
                  <div>
                    <h3 className="font-serif text-[1.45rem] leading-snug tracking-tight">
                      {role.company}
                    </h3>
                    <p className="mt-1 text-sm text-ink">{role.title}</p>
                    <p className="mt-2 leading-relaxed text-muted">
                      {role.summary}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Contact */}
        <section id="contact" className="border-t border-line py-20 sm:py-28">
          <p className="eyebrow">Contact</p>
          <h2 className="display mt-4 max-w-[18ch] text-[clamp(2.2rem,5.4vw,4rem)]">
            Let&rsquo;s talk about data, tools, and hard questions.
          </h2>
          <a
            href={`mailto:${site.email}`}
            className="link mt-8 inline-block font-serif text-[1.5rem] tracking-tight"
          >
            {site.email}
          </a>
        </section>
      </div>
    </>
  );
}
