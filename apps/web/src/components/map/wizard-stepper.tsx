import { mapContent } from "@/data/map";
import { cn } from "@/lib/utils";

export type WizardStep = "edit" | "export" | "parse" | "tactile";

const ORDER: WizardStep[] = ["parse", "edit", "tactile", "export"];

type WizardStepperProps = {
  current: WizardStep;
};

export function WizardStepper({ current }: WizardStepperProps) {
  const currentIndex = ORDER.indexOf(current);
  return (
    <nav className="flex items-center justify-center gap-2 py-5">
      {ORDER.map((step, index) => (
        <div className="flex items-center gap-2" key={step}>
          {index > 0 && <span className="w-6 border-t border-border" />}
          <span
            className={cn(
              "font-mono text-xs",
              index === currentIndex
                ? "text-foreground"
                : index < currentIndex
                  ? "text-muted-foreground line-through decoration-border"
                  : "text-muted-foreground/60"
            )}
          >
            {index + 1} {mapContent.steps[step]}
          </span>
        </div>
      ))}
    </nav>
  );
}
