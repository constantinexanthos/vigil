import { modelLongName } from "../lib/model-tokens";

interface Props {
  model: string | null | undefined;
}

// ModelPill is the long-form model name (Claude Opus 4.7, GPT-5). Was
// tinted with the family hue at low opacity; same color-discipline reason
// as ModelChip — neutral now. data-model-family stays on the DOM for
// callers (and tests) that want to assert the family classification.
export function ModelPill({ model }: Props) {
  if (!model) return null;
  const name = modelLongName(model);
  return (
    <span
      className="rounded-full px-2 py-[2px] text-[10px] font-medium tracking-wide bg-vigil-surface text-vigil-mute"
      data-model-family={modelFamilyTag(model)}
    >
      {name}
    </span>
  );
}

function modelFamilyTag(model: string): string {
  if (model.startsWith("claude")) return "claude";
  if (model.startsWith("gpt") || model.startsWith("o")) return "openai";
  return "unknown";
}
