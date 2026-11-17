import { useState } from "react";
import { useFetcher } from "react-router";
import { Lock, NotebookPen } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Textarea } from "~/components/ui/textarea";
import { cn, formatRelativeTime } from "~/lib/utils";
import {
  describeNoteDraft,
  type NoteDraftStatus,
} from "~/modules/lesson-notes";

type Note = { body: string; updatedAt: string } | null;

// Laid out like the Questions & Discussion card below it, so the two read as
// one family: same header, same textarea, same footer with a counter.
export function LessonNote({ note }: { note: Note }) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const [body, setBody] = useState(note?.body ?? "");
  const draft = describeNoteDraft({
    draft: body,
    saved: note?.body ?? null,
    saving: fetcher.state !== "idle",
    error: fetcher.data?.error,
  });

  return (
    <Card className="mb-8">
      <CardContent className="p-6">
        <LessonNoteHeader />

        <fetcher.Form method="post" className="space-y-2">
          <input type="hidden" name="intent" value="save-note" />
          <Textarea
            name="body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={5}
            placeholder="Jot down what clicked, what didn't, or what to come back to..."
            aria-label="Your notes on this lesson"
            className="resize-y"
          />

          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={!draft.canSave}>
              {draft.status.kind === "saving" ? "Saving..." : "Save note"}
            </Button>
            <DraftStatus status={draft.status} updatedAt={note?.updatedAt} />
            <span
              className={cn(
                "ml-auto text-xs",
                draft.tooLong ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {draft.length} / {draft.max}
            </span>
          </div>
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}

function DraftStatus({
  status,
  updatedAt,
}: {
  status: NoteDraftStatus;
  updatedAt: string | undefined;
}) {
  switch (status.kind) {
    case "error":
      return <span className="text-xs text-destructive">{status.message}</span>;
    case "too-long":
      return (
        <span className="text-xs text-destructive">
          Too long to save. Trim it down a little.
        </span>
      );
    case "unsaved":
      return (
        <span className="text-xs text-muted-foreground">Unsaved changes</span>
      );
    case "saved":
      return updatedAt ? (
        <span
          suppressHydrationWarning
          className="text-xs text-muted-foreground"
        >
          Saved {formatRelativeTime(updatedAt)}
        </span>
      ) : null;
    case "saving":
    case "empty":
      return null;
  }
}

function LessonNoteHeader() {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="flex items-center gap-2">
        <NotebookPen className="size-5 text-primary" />
        <h2 className="text-xl font-semibold">Your notes</h2>
      </div>
      <span className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
        <Lock className="size-3" />
        Only you can see these
      </span>
    </div>
  );
}
