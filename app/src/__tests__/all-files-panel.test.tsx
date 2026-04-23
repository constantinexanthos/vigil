import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AllFilesPanel } from "../components/AllFilesPanel";
import type { SessionFile } from "../types";

function file(partial: Partial<SessionFile>): SessionFile {
  return { path: "x.ts", kind: "file_modify", diff: null, added: 0, removed: 0, ...partial };
}

describe("AllFilesPanel", () => {
  it("renders an empty state when no files", () => {
    render(<AllFilesPanel files={[]} />);
    expect(screen.getByText(/no files touched yet/i)).toBeInTheDocument();
  });

  it("renders one row per file", () => {
    const files: SessionFile[] = [
      file({ path: "src/a.ts", added: 3, removed: 1 }),
      file({ path: "src/b.ts", added: 10, removed: 0 }),
    ];
    render(<AllFilesPanel files={files} />);
    expect(screen.getByText(/src\/a\.ts/)).toBeInTheDocument();
    expect(screen.getByText(/src\/b\.ts/)).toBeInTheDocument();
  });

  it("sorts by total lines changed descending", () => {
    const files: SessionFile[] = [
      file({ path: "small.ts", added: 1, removed: 0 }),
      file({ path: "big.ts", added: 50, removed: 10 }),
      file({ path: "medium.ts", added: 5, removed: 5 }),
    ];
    render(<AllFilesPanel files={files} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("big.ts");
    expect(rows[1]).toHaveTextContent("medium.ts");
    expect(rows[2]).toHaveTextContent("small.ts");
  });

  it("shows +/- diff stats per file", () => {
    render(<AllFilesPanel files={[file({ path: "x.ts", added: 12, removed: 3 })]} />);
    expect(screen.getByText("+12")).toBeInTheDocument();
    expect(screen.getByText("-3")).toBeInTheDocument();
  });
});
