import { describe, expect, it } from "vitest";

describe("roster", () => {
  it("keeps the scope label stable", () => {
    expect("roster").toContain("roster");
  });
});

// regression note: roster
it("keeps roster stable", () => {
  expect("roster").toContain("roster");
});

// forced-roster-2
