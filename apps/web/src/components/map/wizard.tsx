"use client";

import { useState } from "react";
import type { FloorModel } from "@bumps/floor-model";
import { Button } from "@/components/ui/button";
import { EditStep } from "@/components/map/edit-step";
import { WizardStepper, type WizardStep } from "@/components/map/wizard-stepper";
import { mapContent } from "@/data/map";

type WizardProps = {
  initialModel: FloorModel;
  initialVersion: number;
  projectId: string;
};

export function Wizard({ initialModel, initialVersion, projectId }: WizardProps) {
  const [step, setStep] = useState<WizardStep>("edit");

  return (
    <section className="flex h-dvh flex-col overflow-hidden px-6 pb-4">
      <WizardStepper current={step} />
      {step === "edit" ? (
        <EditStep
          initialModel={initialModel}
          initialVersion={initialVersion}
          onNext={() => setStep("tactile")}
          projectId={projectId}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <p className="text-sm text-muted-foreground">
            {mapContent.tactilePlaceholder}
          </p>
          <Button
            className="cursor-pointer rounded-sm"
            onClick={() => setStep("edit")}
            size="sm"
            type="button"
            variant="outline"
          >
            {mapContent.edit.backLabel}
          </Button>
        </div>
      )}
    </section>
  );
}
