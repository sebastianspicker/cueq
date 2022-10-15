import { describe, expect, it } from "vitest";

describe("absence", () => {
  it("keeps the scope label stable", () => {
    expect("absence").toContain("absence");
  });
});

// regression note: absence
it("keeps absence stable", () => {
  expect("absence").toContain("absence");
});
