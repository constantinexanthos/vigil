interface Props {
  cli: { claude: boolean; codex: boolean };
}

export function Onboarding({ cli: _cli }: Props) {
  return (
    <div className="h-full flex items-center justify-center bg-[#0f0f11] text-white">
      <div className="text-[13px] text-white/60">Loading Vigil...</div>
    </div>
  );
}
