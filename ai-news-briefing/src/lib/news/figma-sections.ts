/**
 * Fixed order for Figma home newsfeed + digest sections.
 */
export type FigmaSectionDef = {
  key: string;
  title: string;
  /** NewsAPI everything query */
  q: string;
  language?: string;
  pageSize: number;
  /** When /everything returns nothing (e.g. dev tier / same-day gap) */
  fallback?: {
    country: string;
    category: "general" | "business" | "sports" | "technology";
  };
};

export const FIGMA_NEWS_SECTIONS: FigmaSectionDef[] = [
  {
    key: "trending_world",
    title: "Trending world news",
    q: "(world OR international OR global) AND (politics OR economy OR diplomacy)",
    language: "en",
    pageSize: 5,
    fallback: { country: "us", category: "general" },
  },
  {
    key: "reliance",
    title: "News about Reliance",
    q: '"Reliance Industries" OR "Mukesh Ambani" OR Reliance Retail',
    language: "en",
    pageSize: 4,
    fallback: { country: "in", category: "business" },
  },
  {
    key: "jio",
    title: "Reliance Jio",
    q: '"Reliance Jio" OR "Jio Platforms" OR Jio 5G',
    language: "en",
    pageSize: 4,
    fallback: { country: "in", category: "business" },
  },
  {
    key: "ai_tech",
    title: "AI & technology",
    q: '(artificial intelligence OR "machine learning" OR AI) OR (technology OR tech innovation)',
    language: "en",
    pageSize: 5,
    fallback: { country: "us", category: "technology" },
  },
  {
    key: "business_india",
    title: "Business news in India",
    q: "(India OR Indian) AND (business OR economy OR market OR RBI OR startup)",
    language: "en",
    pageSize: 5,
    fallback: { country: "in", category: "business" },
  },
  {
    key: "sports",
    title: "Sports",
    q: "(cricket OR IPL OR sports) AND (India OR international OR world)",
    language: "en",
    pageSize: 5,
    fallback: { country: "in", category: "sports" },
  },
];
