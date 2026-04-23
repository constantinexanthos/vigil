import { modelLongName, modelFamilyColor } from "../lib/model-tokens";

interface Props {
  model: string | null | undefined;
}

export function ModelPill({ model }: Props) {
  if (!model) return null;
  const name = modelLongName(model);
  const color = modelFamilyColor(model);
  return (
    <span
      className="rounded-full px-2 py-[3px] text-[10px] font-medium tracking-wide"
      style={{
        background: `${color}26`,
        color: color,
      }}
    >
      {name}
    </span>
  );
}
