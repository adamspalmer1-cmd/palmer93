export interface CategoryConfig {
  id: string;
  label: string;
  description: string;
}

export const categories: CategoryConfig[] = [
  { id: "politics", label: "Politics", description: "Elections, legislation, and geopolitics." },
  { id: "crypto", label: "Crypto", description: "Token prices, protocol events, and on-chain milestones." },
  { id: "sports", label: "Sports", description: "Championships, tournaments, and season outcomes." },
  { id: "economy", label: "Economy", description: "Rates, inflation, and macroeconomic indicators." },
  { id: "culture", label: "Culture", description: "Entertainment, awards, and pop culture." },
  { id: "science", label: "Science & Tech", description: "Research milestones and technology releases." },
];

export function getCategory(id: string): CategoryConfig | undefined {
  return categories.find((c) => c.id === id);
}
