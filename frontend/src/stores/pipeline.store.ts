import { create } from "zustand";
import type { PipelineStep, Dataset } from "@/types";

interface PipelineState {
  name: string;
  steps: PipelineStep[];
  past: { name: string; steps: PipelineStep[] }[];
  future: { name: string; steps: PipelineStep[] }[];
  activeDataset: Dataset | null;
  activePipelineId: number | null;
  isTranslating: boolean;
  isExecuting: boolean;
  activeJobId: number | null;

  setName: (name: string) => void;
  setSteps: (steps: PipelineStep[]) => void;
  addSteps: (steps: PipelineStep[]) => void;
  removeStep: (index: number) => void;
  moveStep: (from: number, to: number) => void;
  undo: () => void;
  redo: () => void;
  setActiveDataset: (ds: Dataset | null) => void;
  setActivePipelineId: (id: number | null) => void;
  setIsTranslating: (v: boolean) => void;
  setIsExecuting: (v: boolean) => void;
  setActiveJobId: (id: number | null) => void;
  reset: () => void;
}

const HISTORY_LIMIT = 50;

export const usePipelineStore = create<PipelineState>((set, get) => ({
  name: "Untitled Pipeline",
  steps: [],
  past: [],
  future: [],
  activeDataset: null,
  activePipelineId: null,
  isTranslating: false,
  isExecuting: false,
  activeJobId: null,

  setName: (name: string) => {
    const { name: oldName, steps } = get();
    set((s) => ({
      name,
      past: [{ name: oldName, steps: [...steps] }, ...s.past].slice(0, HISTORY_LIMIT),
      future: [],
    }));
  },

  setSteps: (steps: PipelineStep[]) => {
    const { name, steps: oldSteps } = get();
    set((s) => ({
      steps,
      past: [{ name, steps: [...oldSteps] }, ...s.past].slice(0, HISTORY_LIMIT),
      future: [],
    }));
  },

  addSteps: (newSteps: PipelineStep[]) => {
    const { name, steps: oldSteps } = get();
    set((s) => ({
      steps: [...s.steps, ...newSteps],
      past: [{ name, steps: [...oldSteps] }, ...s.past].slice(0, HISTORY_LIMIT),
      future: [],
    }));
  },

  removeStep: (index: number) => {
    const { name, steps: oldSteps } = get();
    set((s) => ({
      steps: s.steps.filter((_, i) => i !== index),
      past: [{ name, steps: [...oldSteps] }, ...s.past].slice(0, HISTORY_LIMIT),
      future: [],
    }));
  },

  moveStep: (from: number, to: number) => {
    const { name, steps: oldSteps } = get();
    set((s) => {
      const steps = [...s.steps];
      const [moved] = steps.splice(from, 1);
      steps.splice(to, 0, moved);
      return {
        steps,
        past: [{ name, steps: [...oldSteps] }, ...s.past].slice(0, HISTORY_LIMIT),
        future: [],
      };
    });
  },

  undo: () => {
    const { past, name, steps, future } = get();
    if (past.length === 0) return;

    const previous = past[0];
    const newPast = past.slice(1);
    
    set({
      name: previous.name,
      steps: previous.steps,
      past: newPast,
      future: [{ name, steps: [...steps] }, ...future].slice(0, HISTORY_LIMIT),
    });
  },

  redo: () => {
    const { future, name, steps, past } = get();
    if (future.length === 0) return;

    const next = future[0];
    const newFuture = future.slice(1);

    set({
      name: next.name,
      steps: next.steps,
      future: newFuture,
      past: [{ name, steps: [...steps] }, ...past].slice(0, HISTORY_LIMIT),
    });
  },

  setActiveDataset: (ds: Dataset | null) => set({ activeDataset: ds }),
  setActivePipelineId: (id: number | null) => set({ activePipelineId: id }),
  setIsTranslating: (v: boolean) => set({ isTranslating: v }),
  setIsExecuting: (v: boolean) => set({ isExecuting: v }),
  setActiveJobId: (id: number | null) => set({ activeJobId: id }),
  reset: () =>
    set({
      name: "Untitled Pipeline",
      steps: [],
      past: [],
      future: [],
      activePipelineId: null,
      activeJobId: null,
      isExecuting: false,
      isTranslating: false,
    }),
}));
