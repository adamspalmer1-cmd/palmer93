import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProbabilityPill } from "@/components/markets/probability-pill";

describe("ProbabilityPill", () => {
  it("renders a positive-toned percentage at or above 50%", () => {
    render(<ProbabilityPill price={0.62} />);
    const el = screen.getByText("62%");
    expect(el.className).toContain("text-positive");
  });

  it("renders a negative-toned percentage below 50%", () => {
    render(<ProbabilityPill price={0.18} />);
    const el = screen.getByText("18%");
    expect(el.className).toContain("text-negative");
  });

  it("renders an em dash for a null price", () => {
    render(<ProbabilityPill price={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
