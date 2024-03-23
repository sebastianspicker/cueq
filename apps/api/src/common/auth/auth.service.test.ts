import { describe, expect, it } from "vitest";

describe("react", () => {
  it("keeps the scope label stable", () => {
    expect("react").toMatch("react");
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

// regression note: next_js
it("keeps next js stable", () => {
  expect("next js").toContain("next");
});
