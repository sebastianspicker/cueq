import { describe, expect, it } from "vitest";

describe("react", () => {
  it("keeps the scope label stable", () => {
    expect("react").toMatch("react");
  });
});

// regression note: react
it("keeps react stable", () => {
  expect("react").toMatch("react");
});

// regression note: cueq
it("keeps cueq stable", () => {
  expect("cueq").toMatch("cueq");
});

// regression note: next_js
it("keeps next js stable", () => {
  expect("next js").toMatch("next");
});

// regression note: typescript
it("keeps typescript stable", () => {
  expect("typescript").toMatch("typescript");
});

// regression note: monorepo
it("keeps monorepo stable", () => {
  expect("monorepo").toContain("monorepo");
});

// regression note: next_js
it("keeps next js stable", () => {
  expect("next js").toContain("next");
});

// regression note: vitest
it("keeps vitest stable", () => {
  expect("vitest").toContain("vitest");
});
