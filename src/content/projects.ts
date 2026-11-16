export type Project = {
  slug: "inflection" | "org-health";
  name: string;
  kicker: string;
  status: string;
  statusNote: string;
  /** Link text on the home page card. */
  cta: string;
  tagline: string;
  summary: string;
  why: string;
  steps: { title: string; body: string }[];
  stack: string[];
  data: string[];
};

export const projects: Project[] = [
  {
    slug: "inflection",
    name: "Inflection",
    kicker: "Time series · Change point detection · LLM",
    status: "Beta",
    statusNote:
      "Working beta. Shift detection runs live in your browser. News explanations need an API key on the server and are rate-limited.",
    cta: "Open the tool",
    tagline: "Find the moments a metric changed, and the news that explains why.",
    summary:
      "Pick a time series, such as a stock price, COVID cases, or attention to a topic. Inflection detects where its behaviour shifted, searches the news around each date, and writes a cited summary of what happened.",
    why: "Dashboards show that a number moved. The follow-up question is always why. At Uber I built change point and anomaly detection into an org analytics product so leaders could see when their metrics shifted and what drove it. Inflection applies the same idea to public data anyone can explore.",
    steps: [
      {
        title: "Choose a series",
        body: "Start from an example, or enter any stock ticker or Wikipedia article. Prices come from Yahoo Finance, pageviews from Wikimedia, and COVID data from Our World in Data.",
      },
      {
        title: "Detect the shifts",
        body: "Dynamic programming finds the best possible segmentation for every number of shifts at once, so the slider updates instantly. Choose between changes in trend and shifts in level, on a linear or log scale.",
      },
      {
        title: "Find the context",
        body: "For each shift, Claude searches news coverage from the surrounding days. Only dates and numbers leave the browser; the server writes the prompt.",
      },
      {
        title: "Summarize with citations",
        body: "The model writes a short explanation for each shift and an overall narrative of the series. Source links come from the search results it cited, and it is told to say so when no clear cause turns up.",
      },
    ],
    stack: ["TypeScript", "Next.js", "D3.js", "Claude API", "Python (ruptures) for validation"],
    data: ["Yahoo Finance", "Wikimedia Pageviews API", "Our World in Data"],
  },
  {
    slug: "org-health",
    name: "Org Health Explorer",
    kicker: "People analytics · Interactive org chart · LLM assistant",
    status: "Beta",
    statusNote:
      "Working beta. Metrics, detection and all three visualizations run live in your browser. The assistant needs an API key on the server and is rate-limited.",
    cta: "Open the tool",
    tagline: "An open-data rebuild of an organizational analytics product.",
    summary:
      "A working model of the kind of tool I build for HR and business leaders: span of control, management layers, co-location, attrition, and office attendance for a realistic synthetic company. Drill through the organization as a sunburst, treemap or org chart, and ask an assistant questions about it.",
    why: "The Org Health Tool I launched at Uber runs on confidential employee data, so I can't show it. This project recreates the approach on Kestrel, a fictional 5,000-person company with three years of history. A layoff, a return-to-office mandate and a delayering are written into the data, and the detection models find each one without being told where to look.",
    steps: [
      {
        title: "Generate a realistic company",
        body: "A Python simulation builds reporting lines, levels and locations, then runs 36 months of hires, exits, promotions and office attendance, with known events planted in the history.",
      },
      {
        title: "Measure org health",
        body: "One bottom-up pass per month rolls every metric up to every manager, so any leader's organization has a full history: span of control, layers from the CEO, manager co-location, voluntary and involuntary attrition, attendance and tenure.",
      },
      {
        title: "Detect what changed",
        body: "Change point detection finds lasting shifts, a rolling-median filter finds one-month anomalies, and each finding lists the sub-organizations that moved most.",
      },
      {
        title: "Explore the structure",
        body: "A sunburst, a treemap and an org chart, all drillable. Group by department or location, size by headcount, and shade by span of control or average tenure.",
      },
      {
        title: "Ask the assistant",
        body: "Claude answers plain-language questions by calling a fixed set of metric functions. It never sees raw records, and the server refuses any request outside the organization being viewed.",
      },
    ],
    stack: ["Python", "TypeScript", "Next.js", "D3.js", "Claude API"],
    data: ["Synthetic employee data (analysis/generate_org.py)"],
  },
];

export const getProject = (slug: Project["slug"]) =>
  projects.find((p) => p.slug === slug)!;
