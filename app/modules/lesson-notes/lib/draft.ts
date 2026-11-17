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
  const tooLong = length > MAX_NOTE_LENGTH;
  const blank = input.draft.trim().length === 0;
  // The server trims before it stores, so trailing whitespace is not a change.
  const changed = input.draft.trim() !== input.saved;

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
