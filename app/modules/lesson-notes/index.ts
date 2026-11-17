import {
  describeDraft,
  type NoteDraft,
  type NoteDraftInput,
} from "./lib/draft";

export type { NoteDraft, NoteDraftInput, NoteDraftStatus } from "./lib/draft";

/**
 * What the Lesson page's Note editor should show for the text in the box:
 * its status (saving, error, too long, unsaved changes, saved, or empty),
 * whether Save is enabled, and the character count against the limit.
 */
export function describeNoteDraft(input: NoteDraftInput): NoteDraft {
  return describeDraft(input);
}
