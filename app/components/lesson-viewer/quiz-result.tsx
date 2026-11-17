import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import {
  CheckCircle2,
  HelpCircle,
  XCircle,
  Trophy,
  RotateCcw,
} from "lucide-react";
import type {
  Quiz,
  QuizQuestion,
  QuizQuestionResult,
  QuizResult,
} from "./quiz-types";

export function QuizResultCard({
  quiz,
  quizResult,
  onRetake,
}: {
  quiz: Quiz;
  quizResult: QuizResult;
  onRetake: () => void;
}) {
  return (
    <Card className="mb-8">
      <CardContent className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <HelpCircle className="size-5 text-primary" />
          <h2 className="text-xl font-semibold">{quiz.title}</h2>
        </div>

        <ResultSummary quizResult={quizResult} />

        <div className="space-y-4">
          {quiz.questions.map((question, qIndex) => (
            <QuestionResult
              key={question.id}
              question={question}
              index={qIndex}
              result={quizResult.questionResults.find(
                (r) => r.questionId === question.id
              )}
            />
          ))}
        </div>

        {!quizResult.passed && (
          <div className="mt-6">
            <Button variant="outline" onClick={onRetake}>
              <RotateCcw className="mr-2 size-4" />
              Retake Quiz
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ResultSummary({ quizResult }: { quizResult: QuizResult }) {
  return (
    <div
      className={`mb-6 rounded-lg p-4 ${quizResult.passed ? "bg-green-50 dark:bg-green-950" : "bg-red-50 dark:bg-red-950"}`}
    >
      <div className="flex items-center gap-3">
        {quizResult.passed ? (
          <Trophy className="size-8 text-green-600" />
        ) : (
          <XCircle className="size-8 text-red-600" />
        )}
        <div>
          <p
            className={`text-lg font-semibold ${quizResult.passed ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}
          >
            {quizResult.passed ? "You passed!" : "Not quite — try again!"}
          </p>
          <p className="text-sm text-muted-foreground">
            Score: {quizResult.totalCorrect}/{quizResult.totalQuestions} (
            {Math.round(quizResult.score * 100)}%) — Grade: {quizResult.grade}
          </p>
        </div>
      </div>
    </div>
  );
}

function QuestionResult({
  question,
  index,
  result,
}: {
  question: QuizQuestion;
  index: number;
  result: QuizQuestionResult | undefined;
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 flex items-start gap-2">
        {result?.correct ? (
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-600" />
        ) : (
          <XCircle className="mt-0.5 size-5 shrink-0 text-red-600" />
        )}
        <p className="font-medium">
          {index + 1}. {question.questionText}
        </p>
      </div>
      <div className="ml-7 space-y-1">
        {question.options.map((option) => {
          const isSelected = result?.selectedOptionId === option.id;
          const isCorrect = result?.correctOptionId === option.id;
          let className = "text-sm";
          if (isCorrect)
            className += " font-medium text-green-700 dark:text-green-400";
          else if (isSelected && !result?.correct)
            className += " text-red-600 dark:text-red-400 line-through";
          return (
            <p key={option.id} className={className}>
              {isCorrect ? "✓ " : isSelected ? "✗ " : "  "}
              {option.optionText}
            </p>
          );
        })}
      </div>
    </div>
  );
}
