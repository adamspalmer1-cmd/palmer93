import {
  LayoutDashboard,
  LineChart,
  Landmark,
  Bitcoin,
  Trophy,
  Banknote,
  Star,
  Activity,
  Radar,
  BrainCircuit,
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
  activity: Activity,
  radar: Radar,
  "brain-circuit": BrainCircuit,
};

export function NavIcon({ name, className }: { name: NavItem["icon"]; className?: string }) {
  const Icon = icons[name];
  return <Icon className={className} />;
}
