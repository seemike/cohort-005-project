import type { useFetcher } from "react-router";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { HelpCircle } from "lucide-react";
import type { Quiz, QuizQuestion } from "./quiz-types";

type Answers = Record<number, number>;

export function QuizForm({
  quiz,
  quizFetcher,
  isSubmitting,
  selectedAnswers,
  onSelect,
  onSubmit,
}: {
  quiz: Quiz;
  quizFetcher: ReturnType<typeof useFetcher>;
  isSubmitting: boolean;
  selectedAnswers: Answers;
  onSelect: (questionId: number, optionId: number) => void;
  onSubmit: () => void;
}) {
  const allAnswered = quiz.questions.every(
    (q) => selectedAnswers[q.id] !== undefined
  );

  return (
    <Card className="mb-8">
      <CardContent className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <HelpCircle className="size-5 text-primary" />
          <h2 className="text-xl font-semibold">{quiz.title}</h2>
        </div>
        <p className="mb-6 text-sm text-muted-foreground">
          Answer all questions and submit. Passing score:{" "}
          {Math.round(quiz.passingScore * 100)}%.
        </p>

        <quizFetcher.Form method="post" onSubmit={onSubmit}>
          <input type="hidden" name="intent" value="submit-quiz" />
          <input type="hidden" name="quizId" value={quiz.id} />

          <div className="space-y-6">
            {quiz.questions.map((question, qIndex) => (
              <QuestionField
                key={question.id}
                question={question}
                index={qIndex}
                selectedOptionId={selectedAnswers[question.id]}
                onSelect={onSelect}
              />
            ))}
          </div>

          <SubmitRow allAnswered={allAnswered} isSubmitting={isSubmitting} />
        </quizFetcher.Form>
      </CardContent>
    </Card>
  );
}

function QuestionField({
  question,
  index,
  selectedOptionId,
  onSelect,
}: {
  question: QuizQuestion;
  index: number;
  selectedOptionId: number | undefined;
  onSelect: (questionId: number, optionId: number) => void;
}) {
  return (
    <div className="rounded-lg border p-4">
      <p className="mb-3 font-medium">
        {index + 1}. {question.questionText}
      </p>
      <div className="space-y-2">
        {question.options.map((option) => (
          <label
            key={option.id}
            className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-muted"
          >
            <input
              type="radio"
              name={`question-${question.id}`}
              value={option.id}
              checked={selectedOptionId === option.id}
              onChange={() => onSelect(question.id, option.id)}
              className="size-4 accent-primary"
            />
            <span className="text-sm">{option.optionText}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function SubmitRow({
  allAnswered,
  isSubmitting,
}: {
  allAnswered: boolean;
  isSubmitting: boolean;
}) {
  return (
    <div className="mt-6">
      <Button type="submit" disabled={!allAnswered || isSubmitting}>
        {isSubmitting ? "Submitting..." : "Submit Quiz"}
      </Button>
      {!allAnswered && (
        <p className="mt-2 text-sm text-muted-foreground">
          Please answer all questions before submitting.
        </p>
      )}
    </div>
  );
}
