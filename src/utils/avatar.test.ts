import { describe, expect, it } from "vitest";
import { nameInitials } from "@/utils/avatar";

describe("nameInitials", () => {
  it("falls back to '?' for missing or empty names", () => {
    expect(nameInitials(null)).toBe("?");
    expect(nameInitials(undefined)).toBe("?");
    expect(nameInitials("")).toBe("?");
    expect(nameInitials("   ")).toBe("?");
  });

  it("takes the first two letters of a single-word name", () => {
    expect(nameInitials("Linus")).toBe("LI");
    expect(nameInitials("ada")).toBe("AD");
  });

  it("takes first + last initials for multi-word names", () => {
    expect(nameInitials("Ada Lovelace")).toBe("AL");
    expect(nameInitials("Grace Hopper")).toBe("GH");
    expect(nameInitials("Mary Shelley Wollstonecraft")).toBe("MW");
  });

  it("normalizes whitespace around the input", () => {
    expect(nameInitials("  Ada Lovelace  ")).toBe("AL");
    expect(nameInitials("Ada\tLovelace")).toBe("AL");
  });
});
