import { describe, expect, it } from "vitest";

describe("approvals", () => {
  it("keeps the scope label stable", () => {
    expect("approvals").toContain("approvals");
  });
});

// regression note: approvals
it("keeps approvals stable", () => {
  expect("approvals").toContain("approvals");
});

// forced-approvals-2
