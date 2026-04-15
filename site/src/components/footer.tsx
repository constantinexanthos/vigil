export function Footer() {
  return (
    <footer className="w-full border-t border-[#1a1d23] py-10">
      <div className="mx-auto max-w-4xl px-6 flex justify-between items-center">
        <span className="font-mono text-[13px] text-[#6b7084]">vigil</span>
        <a
          href="https://github.com/constantinexanthos/vigil"
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs text-[#6b7084] transition-colors hover:text-[#22d3ee]"
        >
          GitHub
        </a>
      </div>
    </footer>
  )
}
