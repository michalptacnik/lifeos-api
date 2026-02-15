import { describe, expect, it } from "vitest";
import { escapeIcsText } from "./calendar.js";

describe("ICS escaping", () => {
  it("escapes reserved characters and newlines", () => {
    const value = "Line 1, part; two\npath\\file";
    expect(escapeIcsText(value)).toBe("Line 1\\, part\\; two\\npath\\\\file");
  });
});
