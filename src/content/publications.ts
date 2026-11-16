export type Publication = {
  title: string;
  authors: string;
  venue: string;
  year: number;
  doi?: string;
};

export const publications: Publication[] = [
  {
    title:
      "Assessing the impact of community-based interventions on hypertension and diabetes management in three Minnesota communities: Findings from the prospective evaluation of US HealthRise Programs",
    authors: "Fullman N, Cowling K, Flor LS, …, Phillips BK, …, Gakidou E.",
    venue: "PLOS ONE",
    year: 2023,
  },
  {
    title:
      "Community-based interventions for detection and management of diabetes and hypertension in underserved communities: a mixed-methods evaluation in Brazil, India, South Africa",
    authors: "Flor LS, Wilson S, Bhatt P, …, Phillips B, …, Gakidou E.",
    venue: "BMJ Global Health",
    year: 2020,
  },
  {
    title:
      "Identifying gaps in the continuum of care for cardiovascular disease and diabetes in two communities in South Africa: Baseline findings from the HealthRise project",
    authors: "Wollum A, Gabert R, McNellan CR, …, Phillips B, …, Duber HC.",
    venue: "PLOS ONE",
    year: 2018,
    doi: "10.1371/journal.pone.0192603",
  },
  {
    title:
      "Identifying gaps in the continuum of care for hypertension and diabetes in two Indian communities",
    authors: "Gabert R, Ng M, Sogarwal R, …, Phillips B, …, Duber H.",
    venue: "BMC Health Services Research",
    year: 2017,
    doi: "10.1186/s12913-017-2796-9",
  },
  {
    title:
      "Public knowledge of cardiovascular disease, myocardial infarction, and cardiac arrest in 3 cities in China and India",
    authors: "Duber H, McNellan C, Wollum A, Phillips B, …, Ng M.",
    venue: "Heart (BMJ)",
    year: 2017,
    doi: "10.1136/heartjnl-2017-311388",
  },
  {
    title: "Acute cardiac care in China: A needs assessment",
    authors: "Ng M, Thomson B, Li Y, Zhou M, Wang L, Phillips B, …, Wang H.",
    venue: "Circulation: Cardiovascular Quality and Outcomes",
    year: 2015,
  },
  {
    title:
      "Global, regional, and national disability-adjusted life years (DALYs) for 306 diseases and injuries and healthy life expectancy (HALE) for 188 countries, 1990–2013",
    authors: "GBD 2013 DALYs and HALE Collaborators.",
    venue: "The Lancet",
    year: 2015,
    doi: "10.1016/S0140-6736(15)61340-X",
  },
  {
    title:
      "Global, regional, and national incidence, prevalence, and years lived with disability for 301 acute and chronic diseases and injuries in 188 countries, 1990–2013",
    authors: "Global Burden of Disease Study 2013 Collaborators.",
    venue: "The Lancet",
    year: 2015,
    doi: "10.1016/S0140-6736(15)60692-4",
  },
  {
    title:
      "Global, regional, and national age-sex specific all-cause and cause-specific mortality for 240 causes of death, 1990–2013",
    authors: "GBD 2013 Mortality and Causes of Death Collaborators.",
    venue: "The Lancet",
    year: 2014,
    doi: "10.1016/S0140-6736(14)61682-2",
  },
  {
    title:
      "Global, regional, and national incidence and mortality for HIV, tuberculosis, and malaria during 1990–2013",
    authors: "Murray CJL, Ortblad KF, Guinovart C, …, Phillips BK, …, Vos T.",
    venue: "The Lancet",
    year: 2014,
    doi: "10.1016/S0140-6736(14)60844-8",
  },
  {
    title:
      "Global, regional, and national levels of neonatal, infant, and under-5 mortality during 1990–2013",
    authors: "Wang H, Liddell CA, Coates MM, …, Phillips BK, …, Murray CJL.",
    venue: "The Lancet",
    year: 2014,
    doi: "10.1016/S0140-6736(14)60497-9",
  },
];
