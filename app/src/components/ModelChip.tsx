import { modelShortName } from "../lib/model-tokens";

interface Props {
  model: string | null | undefined;
}

// ModelChip is a 4-letter family tag (OPUS / SONN / GPT5). Was painted in
// per-family hues (Claude purple, OpenAI pink); the polish pass drops the
// hue per "no extra hues for small primitives". The family is still
// readable from the text — that's what the chip is for.
export function ModelChip({ model }: Props) {
  if (!model) return null;
  const name = modelShortName(model);
  return (
    <span
      className="shrink-0 font-mono px-1.5 py-0.5 rounded-sm text-[9px] tracking-wide bg-vigil-surface text-vigil-mute"
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
