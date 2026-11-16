import type { Metadata } from "next";
import { education, experience, skills } from "@/content/experience";
import { publications } from "@/content/publications";

export const metadata: Metadata = {
  title: "About",
  description:
    "Background, experience, education, and publications of Bryan Phillips, data scientist.",
};

function SectionHeading({ label, title }: { label: string; title: string }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <h2 className="display mt-4 text-[clamp(1.8rem,3.6vw,2.5rem)]">{title}</h2>
    </div>
  );
}

export default function About() {
  return (
    <div className="mx-auto max-w-[1120px] px-5 sm:px-8">
      <section className="pt-16 pb-16 sm:pt-24 sm:pb-20">
        <p className="eyebrow rise">About</p>
        <h1
          className="display rise mt-6 max-w-[18ch] text-[clamp(2.5rem,6vw,4.4rem)]"
          style={{ "--i": 1 } as React.CSSProperties}
        >
          From global health research to people analytics.
        </h1>
        <div
          className="rise mt-10 grid gap-6 md:grid-cols-2 md:gap-12"
          style={{ "--i": 2 } as React.CSSProperties}
        >
          <p className="prose-body">
            I started in public health. At the Institute for Health Metrics and
            Evaluation I worked on the Global Burden of Disease study, where
            estimates for hundreds of diseases in 188 countries had to hold up
            to peer review. That is where I learned to care about data quality
            and honest measurement.
          </p>
          <p className="prose-body">
            Since then I have applied the same habits to hospital operations at
            Kaiser Permanente, telehealth at Amazon, and people analytics at
            Uber. Today I build full analytics products: the pipelines, the
            models, and the interactive tools that leaders use to make
            decisions.
          </p>
        </div>
      </section>

      {/* Experience */}
      <section className="grid gap-10 border-t border-line py-16 sm:py-20 lg:grid-cols-[1fr_2.4fr]">
        <SectionHeading label="Experience" title="Where I've worked" />
        <ol>
          {experience.map((role) => (
            <li
              key={role.company}
              className="border-t border-line py-9 first:border-t-0 first:pt-0"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <h3 className="font-serif text-[1.7rem] leading-tight tracking-tight">
                  {role.company}
                </h3>
                <p className="font-mono text-xs text-muted">
                  {role.years} · {role.location}
                </p>
              </div>
              <p className="mt-2 text-[0.95rem] font-medium text-ink">{role.title}</p>
              {role.team && <p className="mt-0.5 text-sm text-muted">{role.team}</p>}
              <ul className="mt-5 space-y-3">
                {role.bullets.map((b) => (
                  <li
                    key={b}
                    className="relative pl-5 leading-relaxed text-muted before:absolute before:top-[0.7em] before:left-0 before:h-px before:w-2.5 before:bg-faint"
                  >
                    {b}
                  </li>
                ))}
              </ul>
              {role.stack && (
                <ul className="mt-5 flex flex-wrap gap-1.5">
                  {role.stack.map((s) => (
                    <li
                      key={s}
                      className="rounded-full border border-line px-2.5 py-1 font-mono text-[0.7rem] text-muted"
                    >
                      {s}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* Skills */}
      <section className="grid gap-10 border-t border-line py-16 sm:py-20 lg:grid-cols-[1fr_2.4fr]">
        <SectionHeading label="Skills" title="What I work with" />
        <div className="grid gap-8 sm:grid-cols-3">
          {skills.map((group) => (
            <div key={group.group}>
              <h3 className="text-sm font-medium text-ink">{group.group}</h3>
              <ul className="mt-3 space-y-1.5 text-[0.95rem] leading-relaxed text-muted">
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Education */}
      <section className="grid gap-10 border-t border-line py-16 sm:py-20 lg:grid-cols-[1fr_2.4fr]">
        <SectionHeading label="Education" title="Training" />
        <ul>
          {education.map((e) => (
            <li
              key={e.school}
              className="grid gap-x-8 gap-y-1 border-t border-line py-5 first:border-t-0 first:pt-0 sm:grid-cols-[8.5rem_1fr]"
            >
              <p className="pt-1 font-mono text-xs text-muted">{e.years}</p>
              <div>
                <h3 className="font-serif text-[1.3rem] leading-snug tracking-tight">
                  {e.school}
                </h3>
                <p className="mt-1 text-[0.95rem] text-muted">{e.degree}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Publications */}
      <section className="grid gap-10 border-t border-line py-16 sm:py-20 lg:grid-cols-[1fr_2.4fr]">
        <SectionHeading label="Publications" title="Peer-reviewed research" />
        <ol>
          {publications.map((p) => (
            <li
              key={p.title}
              className="grid gap-x-8 gap-y-1 border-t border-line py-5 first:border-t-0 first:pt-0 sm:grid-cols-[3.5rem_1fr]"
            >
              <p className="pt-1 font-mono text-xs text-muted">{p.year}</p>
              <div>
                <h3 className="leading-snug text-ink">
                  {p.doi ? (
                    <a
                      className="link"
                      href={`https://doi.org/${p.doi}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {p.title}
                    </a>
                  ) : (
                    p.title
                  )}
                </h3>
                <p className="mt-1.5 text-sm text-muted">
                  <em className="font-serif text-[0.98rem]">{p.venue}</em> · {p.authors}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
