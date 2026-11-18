import { afterEach, describe, expect, it } from "vitest";
import { env } from "@/lib/env";

describe("SUPERADMIN_EMAILS parsing", () => {
  const before = process.env.SUPERADMIN_EMAILS;
  afterEach(() => {
    process.env.SUPERADMIN_EMAILS = before;
  });
  it("accepts commas, semicolons, spaces, new lines, quotes and capitals", () => {
    process.env.SUPERADMIN_EMAILS = ' "Owner@Example.com" ; second@example.com\nthird@example.com, <fourth@example.com> ';
    expect([...env.superadminEmails()].sort()).toEqual(["fourth@example.com", "owner@example.com", "second@example.com", "third@example.com"]);
  });
  it("ignores empty values and words without @", () => {
    process.env.SUPERADMIN_EMAILS = " , ; none ";
    expect(env.superadminEmails().size).toBe(0);
  });
});
