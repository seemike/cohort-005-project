import { describe, it, expect } from "vitest";
import { describeNoteDraft, type NoteDraftInput } from "../index";
import { MAX_NOTE_LENGTH } from "~/lib/notes";

const base: NoteDraftInput = {
  draft: "",
  saved: null,
  saving: false,
  error: undefined,
};

function draft(overrides: Partial<NoteDraftInput>) {
  return describeNoteDraft({ ...base, ...overrides });
}

describe("describeNoteDraft", () => {
  it("is empty and cannot save before the Student writes anything", () => {
    const result = draft({});
    expect(result.status).toEqual({ kind: "empty" });
    expect(result.canSave).toBe(false);
    expect(result.length).toBe(0);
    expect(result.max).toBe(MAX_NOTE_LENGTH);
    expect(result.tooLong).toBe(false);
  });

  it("cannot save a box of only whitespace", () => {
    const result = draft({ draft: "   \n " });
    expect(result.status).toEqual({ kind: "empty" });
    expect(result.canSave).toBe(false);
  });

  it("has unsaved changes once the Student types a new Note", () => {
    const result = draft({ draft: "Generics are templates" });
    expect(result.status).toEqual({ kind: "unsaved" });
    expect(result.canSave).toBe(true);
    expect(result.length).toBe(22);
  });

  it("is saved when the box matches the stored Note", () => {
    const result = draft({ draft: "same", saved: "same" });
    expect(result.status).toEqual({ kind: "saved" });
    expect(result.canSave).toBe(false);
  });

  it("treats trailing whitespace as no change, since the server trims", () => {
    const result = draft({ draft: "  same \n", saved: "same" });
    expect(result.status).toEqual({ kind: "saved" });
    expect(result.canSave).toBe(false);
  });

  it("has unsaved changes when an existing Note is edited", () => {
    const result = draft({ draft: "edited", saved: "original" });
    expect(result.status).toEqual({ kind: "unsaved" });
    expect(result.canSave).toBe(true);
  });

  it("stays saved, not unsaved, when the Student clears an existing Note", () => {
    const result = draft({ draft: "", saved: "original" });
    expect(result.status).toEqual({ kind: "saved" });
    expect(result.canSave).toBe(false);
  });

  it("cannot save whitespace over an existing Note", () => {
    const result = draft({ draft: "  \n ", saved: "original" });
    expect(result.status).toEqual({ kind: "saved" });
    expect(result.canSave).toBe(false);
  });

  it("allows exactly the limit", () => {
    const result = draft({ draft: "a".repeat(MAX_NOTE_LENGTH) });
    expect(result.tooLong).toBe(false);
    expect(result.canSave).toBe(true);
  });

  it("is too long one character past the limit", () => {
    const result = draft({ draft: "a".repeat(MAX_NOTE_LENGTH + 1) });
    expect(result.status).toEqual({ kind: "too-long" });
    expect(result.tooLong).toBe(true);
    expect(result.canSave).toBe(false);
  });

  it("is saving while a save is in flight, and cannot save twice", () => {
    const result = draft({ draft: "new", saving: true });
    expect(result.status).toEqual({ kind: "saving" });
    expect(result.canSave).toBe(false);
  });

  it("shows the server's error", () => {
    const result = draft({ draft: "new", error: "Nope" });
    expect(result.status).toEqual({ kind: "error", message: "Nope" });
    expect(result.canSave).toBe(true);
  });

  it("prefers too-long over a stale server error", () => {
    const result = draft({
      draft: "a".repeat(MAX_NOTE_LENGTH + 1),
      error: "Nope",
    });
    expect(result.status).toEqual({ kind: "too-long" });
  });
});
