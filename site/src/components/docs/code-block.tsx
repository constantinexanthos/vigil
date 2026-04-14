"use client"

interface CodeBlockProps {
  command?: string
  output?: string
  title?: string
}

export function CodeBlock({ command, output, title }: CodeBlockProps) {
  return (
    <div className="my-4 font-mono text-[13px] bg-[#0a0a0a] border border-[#2a2e37] overflow-hidden">
      {title && (
        <div className="px-4 py-2 border-b border-[#1a1d23] text-[#6b7084] text-xs">
          {title}
        </div>
      )}
      <div className="p-4 leading-[1.8]">
        {command && (
          <div>
            <span className="text-[#22d3ee]" style={{ textShadow: "0 0 6px rgba(34, 211, 238, 0.4)" }}>$</span>
            {" "}{command}
          </div>
        )}
        {output && (
          <div className="text-[#6b7084] mt-1 whitespace-pre-wrap">{output}</div>
        )}
      </div>
    </div>
  )
}
