import { modelShortName, modelFamilyColor } from "../lib/model-tokens";

interface Props {
  model: string | null | undefined;
}

export function ModelChip({ model }: Props) {
  if (!model) return null;
  const name = modelShortName(model);
  const color = modelFamilyColor(model);
  return (
    <span
      className="shrink-0 font-mono font-semibold tracking-wide px-1.5 py-0.5 rounded"
      style={{
        fontSize: "9px",
        background: "rgba(255,255,255,0.08)",
        color,
      }}
    >
      {name}
    </span>
  );
}
