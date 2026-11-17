import { LessonProgressStatus } from "~/db/schema";
import { useState, useEffect, useCallback } from "react";
import { useFetcher, useNavigate } from "react-router";
import { Card, CardContent } from "~/components/ui/card";
import type { LessonLoaderData } from "./types";
import { CommentThread } from "~/components/comment-thread";
import { LessonNote } from "~/components/lesson-note";
import { YouTubePlayer } from "~/components/youtube-player";
import { CurriculumSidebar } from "./curriculum-sidebar";
import { LessonBreadcrumb } from "./lesson-breadcrumb";
import { QuizSection } from "./quiz-section";
import { LessonHeader } from "./lesson-header";
import { LessonCompletion } from "./lesson-completion";
import { LessonPager } from "./lesson-pager";

type FullLessonData = Extract<LessonLoaderData, { view: "full" }>;

const AUTOPLAY_KEY = "cadence-autoplay";

function useAutoplay() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    try {
      setEnabled(localStorage.getItem(AUTOPLAY_KEY) === "true");
    } catch {
      /* silently fail */
    }
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(AUTOPLAY_KEY, String(next));
      } catch {
        /* silently fail */
      }
      return next;
    });
  }, []);

  return [enabled, toggle] as const;
}

function useMarkComplete(data: FullLessonData) {
  const { lesson, lessonStatus, nextLesson, course } = data;
  const fetcher = useFetcher({ key: `mark-complete-${lesson.id}` });
  const navigate = useNavigate();

  const isMarking =
    fetcher.state !== "idle" &&
    fetcher.formData?.get("intent") === "mark-complete";

  const justCompleted = fetcher.data?.success;

  const isCompleted =
    lessonStatus === LessonProgressStatus.Completed || justCompleted;

  // Navigate to next lesson after marking complete
  useEffect(() => {
    if (justCompleted && nextLesson) {
      navigate(`/courses/${course.slug}/lessons/${nextLesson.id}`);
    }
  }, [justCompleted, nextLesson, course.slug, navigate]);

  return { fetcher, isMarking, isCompleted: !!isCompleted };
}

export function FullLesson({ data }: { data: FullLessonData }) {
  const { course, lesson, currentUserId, enrolled } = data;

  return (
    <div className="flex">
      {/* Curriculum Sidebar */}
      <CurriculumSidebar
        course={course}
        curriculum={data.curriculum}
        currentLessonId={lesson.id}
        lessonProgressMap={data.lessonProgressMap}
        enrolled={enrolled}
      />

      <div className="flex-1 p-6 lg:p-8">
        <LessonBreadcrumb
          course={course}
          mod={data.module}
          lessonTitle={lesson.title}
        />

        <div className="mx-auto max-w-4xl">
          <LessonHeader
            lesson={lesson}
            showBookmark={!!currentUserId}
            bookmarked={data.bookmarked}
          />
          <LessonMedia data={data} />
          <LessonActivity data={data} />

          {/* Questions & Discussion — confidential to people with access */}
          <CommentThread
            comments={data.comments}
            currentUserId={currentUserId}
            canModerate={data.canModerate}
            canPost
            instructorName={data.instructorName}
          />

          <LessonPager
            course={course}
            prevLesson={data.prevLesson}
            nextLesson={data.nextLesson}
          />
        </div>
      </div>
    </div>
  );
}

function LessonMedia({ data }: { data: FullLessonData }) {
  const { lesson, contentHtml, currentUserId } = data;
  const [autoplay, toggleAutoplay] = useAutoplay();

  return (
    <>
      {/* YouTube Video */}
      {lesson.videoUrl && (
        <YouTubePlayer
          videoUrl={lesson.videoUrl}
          lessonId={lesson.id}
          title={lesson.title}
          startPosition={data.lastWatchPosition}
          durationMinutes={lesson.durationMinutes}
          watchProgress={data.watchProgress}
          trackingEnabled={data.enrolled && !!currentUserId}
          autoplay={autoplay}
          onToggleAutoplay={toggleAutoplay}
        />
      )}

      {/* Note — under the video, so the Student can write while they watch */}
      {currentUserId && <LessonNote key={lesson.id} note={data.note} />}

      {/* Lesson Content */}
      {contentHtml && (
        <div
          className="prose prose-neutral dark:prose-invert mb-8 max-w-none"
          // oxlint-disable-next-line react/no-danger -- the instructor wrote this Markdown
          dangerouslySetInnerHTML={{ __html: contentHtml }}
        />
      )}

      {!contentHtml && !lesson.videoUrl && (
        <Card className="mb-8">
          <CardContent className="py-12 text-center text-muted-foreground">
            No content has been added to this lesson yet.
          </CardContent>
        </Card>
      )}
    </>
  );
}

function LessonActivity({ data }: { data: FullLessonData }) {
  const { lesson, quiz, enrolled, currentUserId } = data;
  const quizFetcher = useFetcher({ key: `quiz-${lesson.id}` });
  const { fetcher, isMarking, isCompleted } = useMarkComplete(data);
  const quizResult = quizFetcher.data?.quizResult ?? null;
  const isSubmittingQuiz = quizFetcher.state !== "idle";

  return (
    <>
      {/* Quiz Section */}
      {quiz && enrolled && currentUserId && (
        <QuizSection
          quiz={quiz}
          bestAttempt={data.bestAttempt}
          quizResult={quizResult}
          quizFetcher={quizFetcher}
          isSubmitting={isSubmittingQuiz}
        />
      )}

      {/* Mark Complete / Up Next */}
      {enrolled && currentUserId && (
        <LessonCompletion
          courseSlug={data.course.slug}
          nextLesson={data.nextLesson}
          isCompleted={isCompleted}
          isMarking={isMarking}
          fetcher={fetcher}
        />
      )}
    </>
  );
}
