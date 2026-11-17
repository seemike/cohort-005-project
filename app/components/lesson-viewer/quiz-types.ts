export type QuizQuestion = {
  id: number;
  questionText: string;
  questionType: string;
  position: number;
  options: Array<{ id: number; optionText: string }>;
};

export type Quiz = {
  id: number;
  title: string;
  passingScore: number;
  questions: QuizQuestion[];
};

export type QuizQuestionResult = {
  questionId: number;
  correct: boolean;
  selectedOptionId: number | null;
  correctOptionId: number | null;
};

export type QuizResult = {
  attemptId: number;
  score: number;
  passed: boolean;
  grade: string;
  totalCorrect: number;
  totalQuestions: number;
  questionResults: QuizQuestionResult[];
};
