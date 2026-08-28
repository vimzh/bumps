import type { Feature } from "@bumps/floor-model";
import {
  Accessibility,
  Armchair,
  ArrowUpDown,
  ChevronsUp,
  ConciergeBell,
  Info,
  LogIn,
  LogOut,
  MapPin,
  Toilet,
  type LucideIcon,
} from "lucide-react";

export const FEATURE_ICON: Record<Feature["kind"], LucideIcon> = {
  elevator: ArrowUpDown,
  entrance: LogIn,
  exit: LogOut,
  "info-point": Info,
  ramp: Accessibility,
  reception: ConciergeBell,
  restroom: Toilet,
  seating: Armchair,
  stairs: ChevronsUp,
  "you-are-here": MapPin,
};
