import { MAX_NOTE_LENGTH } from "~/lib/notes";

export type NoteDraftInput = {
  /** What is in the box now. */
  draft: string;
  /** The body last saved, or null when the Student has no Note yet. */
  saved: string | null;
  saving: boolean;
  error: string | undefined;
};

export type NoteDraftStatus =
  | { kind: "saving" }
  | { kind: "error"; message: string }
  | { kind: "too-long" }
  | { kind: "unsaved" }
  | { kind: "saved" }
  | { kind: "empty" };

export type NoteDraft = {
  status: NoteDraftStatus;
  canSave: boolean;
  length: number;
  max: number;
  tooLong: boolean;
};

export function describeDraft(input: NoteDraftInput): NoteDraft {
  const length = input.draft.length;
  // The server trims before it checks the length and stores, so surrounding
  // whitespace neither counts against the limit nor counts as a change.
  const trimmed = input.draft.trim();
  const tooLong = trimmed.length > MAX_NOTE_LENGTH;
  const blank = trimmed.length === 0;
  const changed = trimmed !== input.saved;

  return {
    status: statusOf(input, { tooLong, blank, changed }),
    canSave: !input.saving && !blank && !tooLong && changed,
    length,
    max: MAX_NOTE_LENGTH,
    tooLong,
  };
}

function statusOf(
  input: NoteDraftInput,
  draft: { tooLong: boolean; blank: boolean; changed: boolean }
): NoteDraftStatus {
  if (input.saving) return { kind: "saving" };
  if (draft.tooLong) return { kind: "too-long" };
  if (input.error) return { kind: "error", message: input.error };
  if (draft.changed && !draft.blank) return { kind: "unsaved" };
  if (input.saved !== null) return { kind: "saved" };
  return { kind: "empty" };
}
