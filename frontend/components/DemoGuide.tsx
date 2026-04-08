"use client";

import { useEffect, useMemo, useState } from "react";

type DemoStep = {
  title: string;
  script: string;
};

const STEPS: DemoStep[] = [
  {
    title: "Step 1: Open Dashboard",
    script: "This tells me exactly who I should talk to today.",
  },
  {
    title: "Step 2: Click A Contact",
    script: "It knows why they matter, what is going on, and what I should say.",
  },
  {
    title: "Step 3: Show Message",
    script: "And it writes it in my voice, not generic automation.",
  },
  {
    title: "Step 4: Click Send",
    script: "Now it logs the interaction, updates relationship context, and keeps momentum moving.",
  },
];

const STORAGE_KEY = "relateos_demo_tour_seen";

export default function DemoGuide() {
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const seen = window.localStorage.getItem(STORAGE_KEY);
    setIsOpen(!seen);
  }, []);

  const step = useMemo(() => STEPS[stepIndex], [stepIndex]);
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;

  const close = () => {
    window.localStorage.setItem(STORAGE_KEY, "true");
    setIsOpen(false);
  };

  const restart = () => {
    setStepIndex(0);
    setIsOpen(true);
  };

  if (!isOpen) {
    return (
      <button
        onClick={restart}
        className="fixed bottom-5 right-5 z-40 rounded-full border border-soft bg-panel px-4 py-2 text-xs font-medium text-text shadow-card hover:bg-soft"
      >
        Run Demo Script
      </button>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-canvas/70 backdrop-blur-sm" aria-hidden="true" />
      <aside className="fixed bottom-5 right-5 z-50 w-full max-w-sm rounded-2xl border border-soft bg-panel p-5 shadow-card">
        <p className="text-[11px] uppercase tracking-[0.2em] text-accent">Guided Demo</p>
        <h3 className="mt-2 text-lg font-semibold text-text">{step.title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted">{step.script}</p>

        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-soft">
          <div
            className="h-full rounded-full bg-accent transition-all duration-300"
            style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted">
          {stepIndex + 1} of {STEPS.length}
        </p>

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
            disabled={isFirst}
            className="rounded-md border border-soft px-3 py-1.5 text-sm text-text hover:bg-soft disabled:opacity-40"
          >
            Back
          </button>
          {!isLast ? (
            <button
              onClick={() => setStepIndex((current) => Math.min(STEPS.length - 1, current + 1))}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-canvas hover:brightness-110"
            >
              Next
            </button>
          ) : (
            <button
              onClick={close}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-canvas hover:brightness-110"
            >
              Finish
            </button>
          )}
          <button
            onClick={close}
            className="ml-auto rounded-md border border-soft px-3 py-1.5 text-sm text-text hover:bg-soft"
          >
            Skip
          </button>
        </div>
      </aside>
    </>
  );
}
