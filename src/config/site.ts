export const siteConfig = {
  name: "MarketSignal",
  description:
    "AI-powered research on Polymarket prediction markets. Not a trading bot — a research platform for spotting potentially mispriced markets.",
  disclaimer:
    "MarketSignal provides research and analysis only. Nothing here is financial advice, and MarketSignal does not place trades on your behalf.",
};

export interface NavItem {
  label: string;
  href: string;
  icon: "layout-dashboard" | "line-chart" | "landmark" | "bitcoin" | "trophy" | "banknote" | "star" | "activity" | "radar";
}

export const dashboardNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "layout-dashboard" },
  { label: "Markets", href: "/markets", icon: "line-chart" },
  { label: "Opportunity Scanner", href: "/scanner", icon: "radar" },
  { label: "Politics", href: "/categories/politics", icon: "landmark" },
  { label: "Crypto", href: "/categories/crypto", icon: "bitcoin" },
  { label: "Sports", href: "/categories/sports", icon: "trophy" },
  { label: "Economy", href: "/categories/economy", icon: "banknote" },
  { label: "Watchlist", href: "/watchlist", icon: "star" },
  { label: "Pipeline Health", href: "/admin/health", icon: "activity" },
];
