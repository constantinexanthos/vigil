import { useCallback, useRef } from "react";
import { useSelection } from "../../store/selection";

interface Props {
  left: React.ReactNode;
  middle: React.ReactNode;
  right: React.ReactNode;
}

export function ThreePaneGrid({ left, middle, right }: Props) {
  const leftWidth = useSelection((s) => s.leftWidth);
  const rightWidth = useSelection((s) => s.rightWidth);
  const setLeft = useSelection((s) => s.setLeftWidth);
  const setRight = useSelection((s) => s.setRightWidth);

  const gridRef = useRef<HTMLDivElement>(null);

  const onLeftDrag = useDividerDrag((deltaPx) => setLeft(leftWidth + deltaPx));
  const onRightDrag = useDividerDrag((deltaPx) => setRight(rightWidth - deltaPx));

  return (
    <div
      ref={gridRef}
      className="h-full w-full grid"
      style={{ gridTemplateColumns: `${leftWidth}px 4px 1fr 4px ${rightWidth}px` }}
    >
      <div className="overflow-hidden">{left}</div>
      <Divider onDrag={onLeftDrag} />
      <div className="overflow-hidden">{middle}</div>
      <Divider onDrag={onRightDrag} />
      <div className="overflow-hidden">{right}</div>
    </div>
  );
}

function Divider({ onDrag }: { onDrag: (e: React.PointerEvent) => void }) {
  return (
    <div
      onPointerDown={onDrag}
      className="cursor-col-resize hover:bg-white/10 transition-colors duration-fast"
      style={{ touchAction: "none" }}
    />
  );
}

function useDividerDrag(onDelta: (deltaPx: number) => void) {
  return useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);

      let last = startX;
      const move = (ev: PointerEvent) => {
        const delta = ev.clientX - last;
        last = ev.clientX;
        onDelta(delta);
      };
      const up = () => {
        target.releasePointerCapture(e.pointerId);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [onDelta],
  );
}
