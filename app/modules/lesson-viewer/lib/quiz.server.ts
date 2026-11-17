import { db } from "~/db";
import {
  quizzes,
  quizQuestions,
  quizOptions,
  quizAttempts,
  quizAnswers,
} from "~/db/schema";
import { and, desc, eq } from "drizzle-orm";

export function getQuizByLessonId(lessonId: number) {
  return db.select().from(quizzes).where(eq(quizzes.lessonId, lessonId)).get();
}

export function getQuizWithQuestions(quizId: number) {
  const quiz = db.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
  if (!quiz) return null;

  const questions = db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quizId))
    .orderBy(quizQuestions.position)
    .all();

  const questionsWithOptions = questions.map((question) => {
    const options = db
      .select()
      .from(quizOptions)
      .where(eq(quizOptions.questionId, question.id))
      .all();
    return { ...question, options };
  });

  return { ...quiz, questions: questionsWithOptions };
}

export function getBestAttempt(userId: number, quizId: number) {
  return db
    .select()
    .from(quizAttempts)
    .where(
      and(eq(quizAttempts.userId, userId), eq(quizAttempts.quizId, quizId))
    )
    .orderBy(desc(quizAttempts.score))
    .limit(1)
    .get();
}

export function calculateGrade(score: number): string {
  if (score >= 0.9) return "A";
  if (score >= 0.8) return "B";
  if (score >= 0.7) return "C";
  if (score >= 0.6) return "D";
  return "F";
}

export type QuestionResult = {
  questionId: number;
  correct: boolean;
  selectedOptionId: number | null;
  correctOptionId: number | null;
};

type QuizQuestionRow = typeof quizQuestions.$inferSelect;

function findCorrectOptionId(question: QuizQuestionRow): number | null {
  if (question.questionType === "multiple_choice") {
    const opts = db
      .select()
      .from(quizOptions)
      .where(eq(quizOptions.questionId, question.id))
      .all();
    const correctOpt = opts.find((o) => o.isCorrect === true);
    return correctOpt ? correctOpt.id : null;
  }
  if (question.questionType === "true_false") {
    const correctOpt = db
      .select()
      .from(quizOptions)
      .where(
        and(
          eq(quizOptions.questionId, question.id),
          eq(quizOptions.isCorrect, true)
        )
      )
      .get();
    return correctOpt ? correctOpt.id : null;
  }
  return null;
}

function scoreQuestion(
  question: QuizQuestionRow,
  selectedAnswers: Record<number, number>
): QuestionResult {
  const selected = selectedAnswers[question.id];
  if (!selected) {
    return {
      questionId: question.id,
      correct: false,
      selectedOptionId: null,
      correctOptionId: null,
    };
  }
  const correctOptionId = findCorrectOptionId(question);
  return {
    questionId: question.id,
    correct: selected === correctOptionId,
    selectedOptionId: selected,
    correctOptionId,
  };
}

function recordAttempt(
  attempt: { userId: number; quizId: number; score: number; passed: boolean },
  questionResults: QuestionResult[]
) {
  const saved = db.insert(quizAttempts).values(attempt).returning().get();

  for (const result of questionResults) {
    if (result.selectedOptionId !== null) {
      db.insert(quizAnswers)
        .values({
          attemptId: saved.id,
          questionId: result.questionId,
          selectedOptionId: result.selectedOptionId,
        })
        .run();
    }
  }
  return saved;
}

function gradeQuiz(
  userId: number,
  quizId: number,
  selectedAnswers: Record<number, number>
) {
  const quiz = db.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
  if (!quiz) {
    console.error("quiz not found");
    return null;
  }

  const questions = db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quizId))
    .orderBy(quizQuestions.position)
    .all();

  const questionResults = questions.map((q) =>
    scoreQuestion(q, selectedAnswers)
  );
  const correct = questionResults.filter((r) => r.correct).length;
  const total = questions.length;
  const scoreValue = total > 0 ? correct / total : 0;
  const passed = scoreValue > 0.7;
  const grade = calculateGrade(scoreValue);

  const attempt = recordAttempt(
    { userId, quizId, score: scoreValue, passed },
    questionResults
  );

  return {
    attemptId: attempt.id,
    score: scoreValue,
    passed,
    grade,
    totalCorrect: correct,
    totalQuestions: total,
    questionResults,
  };
}

export function computeResult(
  userId: number,
  quizId: number,
  selectedAnswers: Record<number, number>
) {
  try {
    return gradeQuiz(userId, quizId, selectedAnswers);
  } catch (error) {
    console.error(error);
    return null;
  }
}
