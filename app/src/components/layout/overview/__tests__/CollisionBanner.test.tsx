import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CollisionBanner } from "../CollisionBanner";

describe("CollisionBanner", () => {
  it("renders nothing when no collisions", () => {
    const { container } = render(<CollisionBanner collisions={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders an alert with role='alert' when collisions exist", () => {
    render(
      <CollisionBanner
        collisions={[{ file_path: "/r/auth.ts", agents: ["claude-code", "cursor"] }]}
      />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/auth\.ts/)).toBeInTheDocument();
  });

  it("shows '+N more' when multiple collisions", () => {
    render(
      <CollisionBanner
        collisions={[
          { file_path: "/r/a.ts", agents: ["claude-code", "cursor"] },
          { file_path: "/r/b.ts", agents: ["claude-code", "codex"] },
          { file_path: "/r/c.ts", agents: ["cursor", "codex"] },
        ]}
      />,
    );
    expect(screen.getByText(/\+2 more/)).toBeInTheDocument();
  });
});
