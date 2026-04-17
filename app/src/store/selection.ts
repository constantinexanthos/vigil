import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SelectionState {
  selectedSessionId: string | null;
  leftWidth: number;
  rightWidth: number;
  setSelected: (id: string | null) => void;
  setLeftWidth: (px: number) => void;
  setRightWidth: (px: number) => void;
}

export const useSelection = create<SelectionState>()(
  persist(
    (set) => ({
      selectedSessionId: null,
      leftWidth: 280,
      rightWidth: 320,
      setSelected: (id) => set({ selectedSessionId: id }),
      setLeftWidth: (px) => set({ leftWidth: clamp(px, 200, 480) }),
      setRightWidth: (px) => set({ rightWidth: clamp(px, 240, 520) }),
    }),
    { name: "vigil-selection" },
  ),
);

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
