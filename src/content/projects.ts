export type Project = {
  slug: "inflection" | "org-explorer" | "nightly" | "taste-map";
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
  /** Related links shown beside the project, such as the repo it grew from. */
  links?: { label: string; href: string }[];
};

export const projects: Project[] = [
  {
    slug: "inflection",
    name: "Inflection",
    kicker: "Time series · Change point detection · LLM",
    status: "Beta",
    statusNote:
      "Working beta. Shift detection runs live in your browser. The example series come with news and summaries prepared ahead of time; any other series or setting is explained on request, which needs API keys on the server and is rate-limited.",
    cta: "Open the tool",
    tagline:
      "Find the moments a metric changed, and the news that explains why.",
    summary:
      "Pick a time series, such as a stock price, COVID cases, or attention to a topic. Inflection detects where its behaviour shifted, searches the news around each date, and writes a cited summary of what happened.",
    why: "Dashboards show that a number moved. The follow-up question is always why. Change point detection is a well-established way to find when a series shifted, and it is a method I use in my own work. Inflection is an independent project that pairs it with news search, on public data anyone can explore.",
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
        body: "For each shift, a news search pulls up to 100 articles from major outlets published around the date and groups those about the same event. The search settings were chosen by testing five variants on 16 shifts with well-known causes. Only dates and numbers leave the browser; the server writes the prompt.",
      },
      {
        title: "Summarize with citations",
        body: "The model writes a short explanation for each shift and an overall narrative of the series. Source links come from the search results it cited, and it is told to say so when no clear cause turns up.",
      },
    ],
    stack: [
      "TypeScript",
      "Next.js",
      "D3.js",
      "Claude API",
      "Python (ruptures) for validation",
    ],
    data: ["Yahoo Finance", "Wikimedia Pageviews API", "Our World in Data"],
  },
  {
    slug: "org-explorer",
    name: "Kestrel Org Explorer",
    kicker: "People analytics · Interactive org chart · LLM assistant",
    status: "Beta",
    statusNote:
      "Working beta. Metrics, detection and all three visualizations run live in your browser. The assistant needs an API key on the server and is rate-limited.",
    cta: "Open the tool",
    tagline: "Organizational analytics for a simulated 5,000-person company.",
    summary:
      "An organizational analytics tool for HR and business leaders: span of control, management layers, co-location, attrition, and office attendance for a realistic synthetic company. Drill through the organization as a sunburst, treemap or org chart, and ask an assistant questions about it.",
    why: "People analytics work runs on confidential employee data, so it rarely gets shown in public. I built this as an independent project, from scratch, using standard people-analytics measures and a company that does not exist. Kestrel is a fictional 5,000-person company with three years of simulated history. A layoff, a return-to-office mandate and a delayering are written into the data, and the detection models find each one without being told where to look.",
    steps: [
      {
        title: "Generate a realistic company",
        body: "A Python simulation builds reporting lines, levels and locations, then runs 36 months of hires, exits, promotions and office attendance, with known events planted in the history.",
      },
      {
        title: "Measure the organization",
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
  {
    slug: "nightly",
    name: "Nightly",
    kicker: "Price modelling · Maps · Prediction ranges",
    status: "Beta",
    statusNote:
      "Working beta. The model is trained offline in Python, and the page loads only its predictions and summaries, so nothing here calls a server.",
    cta: "Open the map",
    tagline: "What a night in New York costs, and how sure a model can be.",
    summary:
      "Click anywhere in New York City, choose the kind of stay, and see the typical nightly Airbnb price there with a range the model can stand behind. Below the map, the model is tested against a simpler one that adjusts for neighbourhood and room type, and the city's listings are compared before and after its 2023 short-term rental rules.",
    why: "In 2020 I predicted New York Airbnb prices for a course project by adding up neighbourhood and room type averages. This is that project rebuilt: a model that learns price from location itself, gives a range instead of a single number, says so when it has too little to go on, and is graded on listings it never saw.",
    steps: [
      {
        title: "Start from public listings",
        body: "Inside Airbnb's September 2026 snapshot has about 30,000 New York listings, of which about 19,000 show a usable price. Stays are grouped by kind, by length (a few nights or a month and more) and by number of guests.",
      },
      {
        title: "Model the price and its spread",
        body: "Three gradient-boosted models predict the 10th, 50th and 90th percentile of price from location, kind of stay, length and guests. Together they give a typical price and a range, not just a point.",
      },
      {
        title: "Calibrate the range",
        body: "A separate fifth of the data checks how often real prices fall inside the range, and a conformal step widens it until the promise of 8 in 10 holds on listings the model has not seen.",
      },
      {
        title: "Refuse to guess",
        body: "Predictions are drawn on a grid of 300-metre squares. Where fewer than five comparable listings sit within a kilometre, the map shows no estimate instead of an extrapolation.",
      },
      {
        title: "Compare 2019 with 2026",
        body: "The 2019 file from my original project and the 2026 snapshot sit either side of Local Law 18. The comparison counts listings and minimum stays, and is labelled as a description, not a causal estimate.",
      },
    ],
    stack: [
      "Python",
      "scikit-learn",
      "pandas",
      "TypeScript",
      "Next.js",
      "Canvas and SVG",
    ],
    data: [
      "Inside Airbnb, New York City, 14 September 2026 (CC BY 4.0). Inside Airbnb is an advocacy project as well as a data source.",
      "New York City Airbnb Open Data, 2019 (Kaggle), from my original project",
    ],
    links: [
      {
        label: "The 2020 course project this grew from",
        href: "https://github.com/bkphillips/NYC_Airbnb_Price_Predict",
      },
    ],
  },
  {
    slug: "taste-map",
    name: "Taste Map",
    kicker: "Recommender systems · Matrix factorization · Maps",
    status: "Beta",
    statusNote:
      "Working beta. The model is trained offline in Python. Your ratings are scored in your browser and are not sent anywhere; poster images load from TMDB.",
    cta: "Open the map",
    tagline:
      "Rate a few films and watch a map of 3,000 light up with your taste.",
    summary:
      "Every dot is a film, placed so that films liked by the same people sit together. Rate a handful and the map shows where your taste lies, with recommendations and the reason for each. Below it, the model is tested the same way you use it: on real people it has never seen, from only a few of their ratings.",
    why: "My first recommender, a 2020 course project, predicted ratings from film and viewer averages. Averages cannot say that two people who both love one film will probably agree about another. This rebuild learns that structure from 32 million ratings, and then has to do the hard part of any recommender: say something useful about a newcomer after ten ratings.",
    steps: [
      {
        title: "Start from 32 million ratings",
        body: "The MovieLens 32M dataset holds ratings from about 200,000 people, collected up to October 2023. Films with at least 200 ratings are modelled, and the 3,000 most rated are drawn on the map.",
      },
      {
        title: "Learn what films have in common",
        body: "Film and viewer averages come out first. Matrix factorization then explains what is left, giving every film and every person 32 numbers, fitted by alternating least squares so that matching numbers predict a higher rating.",
      },
      {
        title: "Draw the map",
        body: "t-SNE flattens the films' 32 numbers to two. Regions are named afterwards from the genres that are unusually common in them; genres play no part in placing the films.",
      },
      {
        title: "Place a visitor",
        body: "Your ratings go through a small ridge regression that finds your own 32 numbers, in your browser. Each film's score for you is how well its numbers match yours.",
      },
      {
        title: "Test it as a newcomer would",
        body: "Thousands of real people were kept out of training. The model sees 3, 5, 10, 20 or 40 of their ratings and predicts the rest, and its top picks are checked for how often those people liked them and for whether everyone gets the same list.",
      },
    ],
    stack: [
      "Python",
      "NumPy",
      "scikit-learn",
      "TypeScript",
      "Next.js",
      "Canvas and SVG",
    ],
    data: [
      "MovieLens 32M (GroupLens, University of Minnesota), for non-commercial use",
      "Posters from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.",
    ],
    links: [
      {
        label: "The 2020 course project this grew from",
        href: "https://github.com/bkphillips/Movie_rating_prediction",
      },
    ],
  },
];

export const getProject = (slug: Project["slug"]) =>
  projects.find((p) => p.slug === slug)!;
