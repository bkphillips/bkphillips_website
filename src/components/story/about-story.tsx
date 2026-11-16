"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { storySteps } from "@/content/story";

// three.js loads only in the browser, after the page's text is up.
const StoryCanvas = dynamic(() => import("@/components/story/story-canvas"), { ssr: false });

/**
 * Career story told by one set of dots. The sculpture stays pinned while the
 * steps scroll past; scroll position decides which shape the dots take.
 */
export function AboutStory() {
  const steps = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const onActive = useCallback((index: number) => setActive(index), []);

  return (
    <section className="border-t border-line" aria-label="Career story">
      <div className="mx-auto max-w-[1120px] px-5 sm:px-8 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14">
        {/* Sculpture: pinned under the header; on phones it takes the top of the screen. */}
        <div className="sticky top-16 z-10 -mx-5 flex h-[46svh] flex-col bg-paper px-5 pt-2 sm:-mx-8 sm:px-8 lg:order-2 lg:mx-0 lg:h-[calc(100svh-4rem)] lg:self-start lg:bg-transparent lg:px-0 lg:py-6">
          <div className="min-h-0 flex-1">
            <StoryCanvas steps={steps} onActive={onActive} />
          </div>
          <p className="border-b border-line pb-2 font-mono text-[0.68rem] leading-relaxed text-muted lg:border-b-0 lg:pb-0">
            {storySteps[active].caption}{" "}
            <span className="hidden text-faint lg:inline">Drag to turn. Move the pointer to part the dots.</span>
          </p>
        </div>

        <div ref={steps} className="lg:order-1">
          {storySteps.map((step, i) => (
            // A step can be a little longer than the rest to give a scroll-driven
            // animation more room; its text keeps moving like any other step.
            <article
              key={step.where}
              style={{ "--len": step.scroll ?? 1 } as React.CSSProperties}
              className={`flex min-h-[calc(82svh*var(--len))] flex-col justify-center py-10 transition-opacity duration-500 lg:min-h-[calc(100svh*var(--len))] ${
                i === active ? "opacity-100" : "opacity-35"
              }`}
            >
              <p className="eyebrow">
                {step.when} · {step.where}
              </p>
              <h2 className="display mt-4 text-[clamp(1.8rem,3.6vw,2.6rem)]">{step.title}</h2>
              {step.paragraphs.map((text) => (
                <p key={text} className="prose-body mt-5">
                  {text}
                </p>
              ))}
              {step.link && (
                <Link href={step.link.href} className="link mt-5 self-start text-[0.95rem] text-ink">
                  {step.link.label} →
                </Link>
              )}
              <p className="mt-6 max-w-[52ch] font-mono text-[0.68rem] leading-relaxed text-faint">{step.note}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
