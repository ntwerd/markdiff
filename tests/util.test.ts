import { describe, it, expect } from "vitest";
import { errorMessage, isRecord } from "../src/lib/util";

describe("errorMessage", () => {
  it("returns the message of an Error", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it("stringifies non-Error values", () => {
    expect(errorMessage("plain string")).toBe("plain string");
    expect(errorMessage(42)).toBe("42");
    expect(errorMessage(null)).toBe("null");
    expect(errorMessage(undefined)).toBe("undefined");
  });
});

describe("isRecord", () => {
  it("is true for plain objects and arrays", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord([])).toBe(true);
  });

  it("is false for null and primitives", () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord("string")).toBe(false);
    expect(isRecord(0)).toBe(false);
  });

  it("narrows the type to a record", () => {
    // Arrange
    const value: unknown = { defaultBaseRef: "HEAD" };

    // Act + Assert — TS narrows inside the branch.
    if (isRecord(value)) {
      expect(typeof value.defaultBaseRef).toBe("string");
    } else {
      expect.fail("expected a record");
    }
  });
});
