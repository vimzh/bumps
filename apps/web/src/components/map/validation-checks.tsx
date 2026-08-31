"use client";

import { Check, X } from "lucide-react";
import type { ValidationReport } from "@bumps/floor-model";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { mapContent } from "@/data/map";

type ValidationChecksProps = {
  report: ValidationReport;
};

export function ValidationChecks({ report }: ValidationChecksProps) {
  const copy = mapContent.tactile.checks;
  const passCount = report.checks.filter(
    (check) => check.status === "pass"
  ).length;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          className="h-8 cursor-pointer rounded-sm px-3 text-xs"
          size="sm"
          type="button"
          variant="outline"
        >
          {copy.buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            {copy.subtitle}{" "}
            <span
              className={
                report.valid ? "text-foreground" : "text-destructive"
              }
            >
              {report.valid
                ? `${passCount}/${report.checks.length} ${copy.passSummary}`
                : `${report.violationCount} ${copy.failSummary}`}
            </span>
          </DialogDescription>
        </DialogHeader>
        <div>
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>{copy.columnCheck}</TableHead>
                <TableHead>
                  {copy.columnRequirement} · {copy.columnMeasured}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.checks.map((check) => (
                <TableRow key={check.id}>
                  <TableCell className="align-top">
                    {check.status === "pass" ? (
                      <Check
                        aria-label="pass"
                        className="size-4 text-(--color-green)"
                      />
                    ) : (
                      <X aria-label="fail" className="size-4 text-destructive" />
                    )}
                  </TableCell>
                  <TableCell className="w-56 align-top whitespace-normal">
                    <p className="text-sm font-medium">{check.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {check.standard}
                      {check.failures > 0
                        ? ` · ${check.failures} violation${check.failures === 1 ? "" : "s"}`
                        : null}
                    </p>
                  </TableCell>
                  <TableCell className="align-top whitespace-normal">
                    <p className="font-mono text-xs text-muted-foreground">
                      {check.requirement}
                    </p>
                    <p className="mt-1 font-mono text-xs tabular-nums text-foreground">
                      {check.measured}
                    </p>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
