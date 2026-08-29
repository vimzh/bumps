import type { ReactNode } from "react";
import { WizardStepper, type WizardStep } from "@/components/map/wizard-stepper";

type MapTopBarProps = {
  actions?: ReactNode;
  current: WizardStep;
  info?: ReactNode;
};

export function MapTopBar({ actions, current, info }: MapTopBarProps) {
  return (
    <header className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 border-b bg-card px-4">
      <div className="flex min-w-0 items-center gap-3 truncate text-sm text-muted-foreground">
        {info}
      </div>
      <WizardStepper current={current} />
      <div className="flex items-center justify-end gap-2">{actions}</div>
    </header>
  );
}
