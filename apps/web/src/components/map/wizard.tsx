"use client";

import { useState } from "react";
import type { FloorModel } from "@bumps/floor-model";
import { EditStep } from "@/components/map/edit-step";
import { TactileStep } from "@/components/map/tactile-step";
import { WizardStepper, type WizardStep } from "@/components/map/wizard-stepper";

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
        <TactileStep onBack={() => setStep("edit")} projectId={projectId} />
      )}
    </section>
  );
}
