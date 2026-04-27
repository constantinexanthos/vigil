import { create } from "zustand";
import { persist } from "zustand/middleware";

export type RightTab = "changes" | "review";

export interface SelectionState {
  selectedSessionId: string | null;
  leftWidth: number;
  rightWidth: number;
  rightTab: RightTab;
  setSelected: (id: string | null) => void;
  setLeftWidth: (px: number) => void;
  setRightWidth: (px: number) => void;
  setRightTab: (t: RightTab) => void;
}

export const useSelection = create<SelectionState>()(
  persist(
    (set) => ({
      selectedSessionId: null,
      leftWidth: 280,
      rightWidth: 320,
      rightTab: "changes",
      setSelected: (id) => set({ selectedSessionId: id }),
      setLeftWidth: (px) => set({ leftWidth: clamp(px, 200, 480) }),
      setRightWidth: (px) => set({ rightWidth: clamp(px, 240, 520) }),
      setRightTab: (t) => set({ rightTab: t }),
    }),
    {
      name: "vigil-selection",
      version: 1,
      // Migration: V2c trims tabs to changes + review. Coerce stale persisted
      // values ("all" / "checks") back to "changes" so the UI doesn't render
      // an empty tab panel on first load after upgrade.
      migrate: (persisted: unknown, _version) => {
        const state = persisted as Partial<SelectionState> | null;
        if (state && state.rightTab !== "changes" && state.rightTab !== "review") {
          return { ...state, rightTab: "changes" as RightTab };
        }
        return state;
      },
    },
  ),
);

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
