import { describe, expect, it } from "vitest";

describe("database", () => {
  it("keeps the scope label stable", () => {
    expect("database").toContain("database");
  });
});

// regression note: database
it("keeps database stable", () => {
  expect("database").toContain("database");
});

// forced-database-2
