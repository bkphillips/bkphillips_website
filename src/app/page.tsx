import Link from "next/link";
import { HeroChart } from "@/components/hero-chart";
import { ProjectArt } from "@/components/project-art";
import { experience } from "@/content/experience";
import { projects } from "@/content/projects";
import { publications } from "@/content/publications";
import { site } from "@/content/site";

const facts = [
  {
    value: "~95%",
    label: "fewer data errors after building a master data system for M&A at Uber",
  },
  {
    value: "4–6 wks",
    label: "advance warning of COVID-19 surges from a forecasting model at Kaiser Permanente",
  },
  {
    value: "300K",
    label: "new enrollments supported by product analytics at Amazon Care",
  },
  {
    value: String(publications.length),
    label: "peer-reviewed publications, five in The Lancet",
  },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-[1120px] px-5 sm:px-8">
      {/* Hero */}
      <section className="pt-16 pb-14 sm:pt-24 sm:pb-20">
        <p className="eyebrow rise">
          {site.role} · {site.location}
        </p>
        <h1
          className="display rise mt-6 max-w-[15ch] text-[clamp(2.7rem,7.2vw,5.4rem)]"
          style={{ "--i": 1 } as React.CSSProperties}
        >
          I build data tools that explain <em>why</em> the numbers moved.
        </h1>
        <p
          className="prose-body rise mt-7 max-w-[58ch] text-[1.14rem]"
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
          className="rise mt-9 flex flex-wrap gap-3"
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

        <div className="rise mt-14 sm:mt-20" style={{ "--i": 4 } as React.CSSProperties}>
          <HeroChart />
          <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-muted">
            This chart is computed in your browser. Each series is generated
            with hidden level shifts, then a PELT change point model finds
            them. Drag the slider to change how much evidence a shift needs.
          </p>
        </div>
      </section>

      {/* Facts */}
      <section className="grid grid-cols-2 border-y border-line lg:grid-cols-4">
        {facts.map((f, i) => (
          <div
            key={f.value}
            className={`py-8 pr-6 ${i % 2 ? "pl-6" : ""} ${
              i > 1 ? "border-t border-line lg:border-t-0" : ""
            } ${i % 2 ? "border-l border-line" : ""} ${
              i === 2 ? "lg:border-l lg:pl-6" : ""
            }`}
          >
            <p className="font-serif text-[1.9rem] leading-none tracking-tight whitespace-nowrap sm:text-[2.4rem]">
              {f.value}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted">{f.label}</p>
          </div>
        ))}
      </section>

      {/* Work */}
      <section id="work" className="py-20 sm:py-28">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Selected work</p>
            <h2 className="display mt-4 text-[clamp(2rem,4.4vw,3.1rem)]">
              Projects you can open and use
            </h2>
          </div>
          <p className="max-w-[40ch] text-sm leading-relaxed text-muted">
            Two interactive tools, built in the open and both in beta. Each
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
                <p className="pt-1 font-mono text-xs text-muted">{role.years}</p>
                <div>
                  <h3 className="font-serif text-[1.45rem] leading-snug tracking-tight">
                    {role.company}
                  </h3>
                  <p className="mt-1 text-sm text-ink">{role.title}</p>
                  <p className="mt-2 leading-relaxed text-muted">{role.summary}</p>
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
  );
}
