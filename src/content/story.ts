/** Copy for the scroll story on the About page. One entry per shape the dots take. */
export type StoryStep = {
  when: string;
  where: string;
  title: string;
  paragraphs: string[];
  /** What the dots show in this chapter, shown under the sculpture. */
  caption: string;
  note: string;
  /** How much longer than a normal step this one scrolls (default 1). */
  scroll?: number;
  link?: { href: string; label: string };
};

export const storySteps: StoryStep[] = [
  {
    when: "2013 – 2016",
    where: "Institute for Health Metrics and Evaluation",
    title: "Measuring the health of 188 countries",
    paragraphs: [
      "I started as a data analyst on the Global Burden of Disease study, where estimates for every country had to hold up to peer review. One of the papers I contributed to tracked deaths of children under five from 1990 onward.",
      "Each dot is a point of land, raised and colored by its country's under-5 mortality. Keep scrolling and the years run forward: worldwide, the rate has fallen by more than half since 1990.",
    ],
    caption:
      "Under-5 mortality by country. Taller and more orange means higher.",
    note: "Data: UN IGME via Our World in Data, 1990 to 2024. IHME's own estimates can't be redistributed, so this uses the open UN series.",
  },
  {
    when: "2017 – 2021",
    where: "Kaiser Permanente",
    title: "Seeing a surge before it arrives",
    paragraphs: [
      "At Kaiser I worked on analytics for 20 hospitals serving 4.5 million members. When COVID-19 arrived I designed the central forecasting dashboard, using anomaly detection on call-center data to predict surges four to six weeks ahead.",
      "Keep scrolling and the dots trace weekly COVID-19 cases in the United States. A red line appears ahead of each surge, where an early warning would fall: the head start that lets a hospital staff up before the wave arrives.",
    ],
    scroll: 1.3,
    caption:
      "Weekly COVID-19 cases, United States, 2020 to 2023. Red lines: early warnings ahead of each surge.",
    note: "Data: WHO via Our World in Data. Each red line sits five weeks before a wave reaches half its height. They illustrate the idea and are not Kaiser's forecasts.",
  },
  {
    when: "2021 – 2022",
    where: "Amazon Care",
    title: "Care for people wherever they live",
    paragraphs: [
      "As product and client analytics lead for Amazon's telehealth service, I modeled health-record, operational and financial data to guide decisions on acquisition, engagement and retention. That work contributed to 300,000 new enrollments and a 120% rise in engagement.",
      "Telehealth reaches people where they are, so the dots now show where Americans live. Each one stands for about 42,000 residents, and together they look like the country's lights seen from orbit.",
    ],
    caption:
      "Where people live in the United States. Each dot is about 42,000 residents.",
    note: "Data: 2020 Census population centers for every census tract. The map shows the US population, not where Amazon Care members were.",
  },
  {
    when: "2023 – now",
    where: "Uber",
    title: "Organizations as data",
    paragraphs: [
      "Today I build analytics products for people and corporate operations: tools that show leaders the shape of their organization and flag when its metrics shift.",
      "Uber's data is confidential, so these dots are the employees of Kestrel, a synthetic company I simulated. Green dots are managers and orange dots are executives.",
    ],
    caption:
      "Every employee of a synthetic company, arranged by reporting line.",
    note: "Data: simulated. The same company powers Kestrel Org Explorer.",
    link: { href: "/work/org-explorer", label: "Open Kestrel Org Explorer" },
  },
];
