import {
  LayoutDashboard,
  LineChart,
  Landmark,
  Bitcoin,
  Trophy,
  Banknote,
  Star,
  type LucideIcon,
} from "lucide-react";
import type { NavItem } from "@/config/site";

const icons: Record<NavItem["icon"], LucideIcon> = {
  "layout-dashboard": LayoutDashboard,
  "line-chart": LineChart,
  landmark: Landmark,
  bitcoin: Bitcoin,
  trophy: Trophy,
  banknote: Banknote,
  star: Star,
};

export function NavIcon({ name, className }: { name: NavItem["icon"]; className?: string }) {
  const Icon = icons[name];
  return <Icon className={className} />;
}
