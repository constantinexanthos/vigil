/**
 * Map the most recent tool call(s) of a session turn to a plain-English
 * verb shown in the PulseLine. Input is a list because an assistant turn
 * can emit multiple tool_use blocks in one message; we describe the first
 * one so the line doesn't flicker as further tools are appended.
 */

export function toolVerb(toolNames: string[]): string | null {
  if (toolNames.length === 0) return null;
  const first = toolNames[0];
  if (first === "Edit" || first === "Write") return "Editing…";
  if (first === "Bash") return "Running a command…";
  if (first === "Read" || first === "Grep" || first === "Glob") return "Reading the code…";
  if (first === "WebFetch" || first === "WebSearch") return "Looking something up…";
  if (first === "Task") return "Dispatching a sub-agent…";
  return "Working…";
}
