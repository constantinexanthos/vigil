import { create } from "zustand";
import { persist } from "zustand/middleware";

export type RightTab = "all" | "changes" | "checks" | "review";

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
    { name: "vigil-selection" },
  ),
);

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
