import { create } from "zustand";
import { persist } from "zustand/middleware";

export type RightTab = "changes" | "review";
export type ViewMode = "overview" | "session" | "proxy";

export interface SelectionState {
  selectedSessionId: string | null;
  leftWidth: number;
  rightWidth: number;
  rightTab: RightTab;
  viewMode: ViewMode;
  setSelected: (id: string | null) => void;
  setLeftWidth: (px: number) => void;
  setRightWidth: (px: number) => void;
  setRightTab: (t: RightTab) => void;
  setViewMode: (m: ViewMode) => void;
}

export const useSelection = create<SelectionState>()(
  persist(
    (set) => ({
      selectedSessionId: null,
      leftWidth: 280,
      rightWidth: 320,
      rightTab: "changes",
      viewMode: "overview",
      setSelected: (id) => set({ selectedSessionId: id }),
      setLeftWidth: (px) => set({ leftWidth: clamp(px, 200, 480) }),
      setRightWidth: (px) => set({ rightWidth: clamp(px, 240, 520) }),
      setRightTab: (t) => set({ rightTab: t }),
      setViewMode: (m) => set({ viewMode: m }),
    }),
    {
      name: "vigil-selection",
      version: 2,
      // V2c trims tabs to changes + review. V3 adds viewMode (default "overview").
      migrate: (persisted: unknown, version) => {
        let state = persisted as Partial<SelectionState> | null;
        if (state && state.rightTab !== "changes" && state.rightTab !== "review") {
          state = { ...state, rightTab: "changes" as RightTab };
        }
        if (state && version < 2) {
          state = { ...state, viewMode: state.viewMode ?? "overview" };
        }
        return state;
      },
    },
  ),
);

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
