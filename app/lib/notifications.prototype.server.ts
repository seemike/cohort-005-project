// PROTOTYPE — throwaway. Answers the wayfinder ticket "What should Notifications
// look like in the app?" (seemike/cohort-005-project#4). Not production code.
//
// Builds fake Notifications for the current user out of real courses and
// lessons, so the variants sit in a realistically dense app. Nothing is
// persisted: read state lives in the browser, in memory.

import { eq, inArray } from "drizzle-orm";
import { db } from "~/db";
import {
  courses,
  enrollments,
  lessons,
  modules,
  UserRole,
} from "~/db/schema";

export type ProtoEvent = "new_question" | "question_answered" | "new_reply";

export interface ProtoNotification {
  id: string;
  event: ProtoEvent;
  actorName: string;
  courseId: number;
  courseTitle: string;
  lessonTitle: string;
  href: string;
  excerpt: string;
  minutesAgo: number;
  read: boolean;
}

const STUDENT_NAMES = [
  "Olivia Martinez",
  "James Park",
  "Liam Thompson",
  "Sophia Davis",
  "Ava Nakamura",
  "Noah Blackwood",
  "Isla Fernandes",
];

const QUESTION_EXCERPTS = [
  "Why does the generic constraint fail when I pass a union here?",
  "Is there a reason to prefer interfaces over type aliases in this lesson?",
  "My container exits immediately after build — what am I missing?",
  "Could you share the final code for the exercise at 12:40?",
  "The chart axis labels overlap on mobile, is that expected?",
];

const REPLY_EXCERPTS = [
  "Same issue here, adding `as const` fixed it for me.",
  "Thanks, that makes sense now!",
  "I think the docs changed since the video was recorded.",
  "+1, would love a follow-up lesson on this.",
];

const ANSWER_EXCERPTS = [
  "Good question! The constraint is checked before narrowing, so…",
  "You need to keep a foreground process running — try `CMD [\"node\", …]`.",
  "Pushed the final code to the repo, see the `lesson-4-end` branch.",
];

function lessonsFor(courseIds: number[]) {
  if (courseIds.length === 0) return [];
  return db
    .select({
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      courseId: courses.id,
      courseTitle: courses.title,
      courseSlug: courses.slug,
    })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(inArray(courses.id, courseIds))
    .all();
}

export function getPrototypeNotifications(
  userId: number | null,
  role: UserRole | null
): ProtoNotification[] {
  if (!userId || !role || role === UserRole.Admin) return [];

  const courseIds =
    role === UserRole.Instructor
      ? db
          .select({ id: courses.id })
          .from(courses)
          .where(eq(courses.instructorId, userId))
          .all()
          .map((c) => c.id)
      : db
          .select({ id: enrollments.courseId })
          .from(enrollments)
          .where(eq(enrollments.userId, userId))
          .all()
          .map((e) => e.id);

  let pool = lessonsFor(courseIds);
  if (pool.length === 0) pool = lessonsFor([1, 2]); // student with no Enrollments: borrow some
  if (pool.length === 0) return [];

  const pick = <T,>(arr: T[], i: number) => arr[i % arr.length];

  // Instructor: mostly New Questions, some New Replies in Threads they joined.
  // Student: Question answered + New Replies.
  const plan: ProtoEvent[] =
    role === UserRole.Instructor
      ? [
          "new_question",
          "new_question",
          "new_reply",
          "new_question",
          "new_question",
          "new_reply",
          "new_question",
          "new_question",
          "new_reply",
          "new_question",
          "new_question",
          "new_question",
        ]
      : [
          "question_answered",
          "new_reply",
          "new_reply",
          "new_reply",
          "question_answered",
          "new_reply",
          "new_reply",
          "new_reply",
        ];

  const minutes = [3, 14, 41, 90, 160, 300, 600, 1500, 2900, 4400, 7300, 12000];

  return plan.map((event, i) => {
    const l = pick(pool, i * 3 + 1);
    const excerpt =
      event === "new_question"
        ? pick(QUESTION_EXCERPTS, i)
        : event === "question_answered"
          ? pick(ANSWER_EXCERPTS, i)
          : pick(REPLY_EXCERPTS, i);
    const actorName =
      event === "question_answered" ? "Sarah Chen" : pick(STUDENT_NAMES, i);
    return {
      id: `seed-${i}`,
      event,
      actorName,
      courseId: l.courseId,
      courseTitle: l.courseTitle,
      lessonTitle: l.lessonTitle,
      href: `/courses/${l.courseSlug}/lessons/${l.lessonId}`,
      excerpt,
      minutesAgo: minutes[i] ?? 20000,
      read: i >= (role === UserRole.Instructor ? 5 : 3),
    };
  });
}
