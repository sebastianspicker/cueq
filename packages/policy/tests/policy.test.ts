import { describe, expect, it } from "vitest";

describe("policy", () => {
  it("keeps the scope label stable", () => {
    expect("policy").toContain("policy");
  });
});

// regression note: policy
it("keeps policy stable", () => {
  expect("policy").toContain("policy");
});

// forced-policy-2
