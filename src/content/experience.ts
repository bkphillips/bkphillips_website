export type Role = {
  years: string;
  company: string;
  team?: string;
  title: string;
  location: string;
  summary: string;
  bullets: string[];
  stack?: string[];
};

export const experience: Role[] = [
  {
    years: "2023 – Present",
    company: "Uber",
    team: "People Analytics, Corporate Operations",
    title: "Data Scientist II, Tech",
    location: "San Francisco, CA",
    summary:
      "Building analytics products that help leaders and HR understand and shape their organizations.",
    bullets: [
      "Launched the Org Health Tool, which lets leaders and HR partners track span of control, manager co-location, layers from the CEO, voluntary and involuntary attrition, and office attendance for their organization.",
      "Built change point and anomaly detection models that flag major shifts in org metrics over time and give context on what drove them.",
      "Added an LLM-powered assistant that answers plain-language questions about a leader's organization, and an interactive org chart.",
      "Built an M&A integration tool that connects to acquired companies' HRIS APIs, maps employees to Uber's job architecture, and lets leaders plan the post-integration org design with before-and-after org charts.",
      "Built a master data management system for M&A employee data with least-privilege access and version control, cutting data errors by about 95% and manual operations by about 85%.",
      "Automated pipelines from Oracle HCM, SAP SuccessFactors, and IntelliHR into the data warehouse, improving data latency by about 95%.",
    ],
    stack: ["Python", "Flask", "React", "D3.js", "SQL", "BigQuery", "Airflow", "Vertex AI"],
  },
  {
    years: "2021 – 2022",
    company: "Amazon",
    team: "Amazon Care",
    title: "Business Intelligence Engineer, Product and Client Analytics Lead",
    location: "San Francisco, CA",
    summary:
      "Led product and client analytics for Amazon's telehealth service.",
    bullets: [
      "Modeled electronic health record, operational, and financial data to guide product decisions on acquisition, engagement, retention, and monetization, contributing to 300,000 new enrollments and a 120% increase in engagement.",
      "Built an automated monthly reporting product for enterprise clients with more than 80 metrics showing the return on Amazon Care's services.",
      "Owned the roadmap for external data products, gathering feedback from clients and stakeholders on new metrics and analytics.",
    ],
  },
  {
    years: "2017 – 2021",
    company: "Kaiser Permanente",
    team: "Northern California Quality and Operations Support",
    title: "Lead Data Consultant",
    location: "Oakland, CA",
    summary:
      "Promoted from Data Analyst to Senior Data Analyst to Lead Data Consultant. Analytics for 20 hospitals serving 4.5 million members.",
    bullets: [
      "Designed the central COVID-19 forecasting dashboard, using anomaly detection on call center data to predict case surges four to six weeks ahead.",
      "Led the measurement strategy for surgical quality initiatives that cut patient opioid exposure by 50% and surgical complications by 17% across more than 120,000 surgeries a year.",
      "Evaluated a tele-ICU program associated with a 17% reduction in hospital mortality and a 28.5-hour reduction in length of stay.",
    ],
  },
  {
    years: "2013 – 2016",
    company: "Institute for Health Metrics and Evaluation",
    title: "Data Analyst",
    location: "Seattle, WA",
    summary:
      "Statistical analysis and data pipelines for global health research, including the Global Burden of Disease study.",
    bullets: [
      "Ran statistical analyses for medical and health policy research papers, several published in The Lancet.",
      "Managed large-scale datasets and pipelines for health research databases.",
    ],
  },
];

export const education = [
  {
    years: "2019 – 2020",
    school: "Harvard University (online)",
    degree: "Professional Certificate in Data Science",
  },
  {
    years: "2016 – 2018",
    school: "University of California, Los Angeles",
    degree: "Master of Public Health, Health Economics and Healthcare Management",
  },
  {
    years: "2009 – 2013",
    school: "University of Washington",
    degree: "B.A., Medical Anthropology and Global Health",
  },
];

export const skills = [
  {
    group: "Languages and tools",
    items: ["Python", "SQL", "R", "JavaScript (React, D3.js)", "Java", "Git"],
  },
  {
    group: "Data platforms",
    items: ["BigQuery", "Apache Airflow", "Vertex AI", "AWS (S3, Redshift)", "Tableau"],
  },
  {
    group: "Methods",
    items: [
      "Change point and anomaly detection",
      "Regression and machine learning",
      "Forecasting",
      "Data modeling and pipelines",
      "LLM applications",
      "Data visualization",
    ],
  },
];
