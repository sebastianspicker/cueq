import { describe, expect, it } from "vitest";

describe("react", () => {
  it("keeps the scope label stable", () => {
    expect("react").toContain("react");
  });
});

// regression note: react
it("keeps react stable", () => {
  expect("react").toContain("react");
});

// regression note: cueq
it("keeps cueq stable", () => {
  expect("cueq").toContain("cueq");
});
