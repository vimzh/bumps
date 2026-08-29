"use client";

import { useState } from "react";
import type { FloorModel } from "@bumps/floor-model";
import { EditStep } from "@/components/map/edit-step";
import { ExportStep } from "@/components/map/export-step";
import { TactileStep } from "@/components/map/tactile-step";
import type { WizardStep } from "@/components/map/wizard-stepper";

type WizardProps = {
  initialModel: FloorModel;
  initialVersion: number;
  projectId: string;
};

export function Wizard({ initialModel, initialVersion, projectId }: WizardProps) {
  const [step, setStep] = useState<WizardStep>("edit");

  return (
    <section className="flex h-dvh flex-col overflow-hidden">
      {step === "edit" ? (
        <EditStep
          initialModel={initialModel}
          initialVersion={initialVersion}
          onNext={() => setStep("tactile")}
          projectId={projectId}
        />
      ) : step === "tactile" ? (
        <TactileStep
          onBack={() => setStep("edit")}
          onNext={() => setStep("export")}
          projectId={projectId}
        />
      ) : (
        <ExportStep onBack={() => setStep("tactile")} projectId={projectId} />
      )}
    </section>
  );
}
