// Internal identifiers and rules are independent of the display language.
export const TOTAL_QUESTIONS = 20;
export const QUESTIONS_PER_TYPE = 10;
export const PENALTY_SECONDS = 5;
export const SCORE_SCALE = 100;
const MAX_CONSECUTIVE_QUESTION_TYPES = 3;
export const COLORS = [
      { id: "red", hex: "#e53935" },
      { id: "blue", hex: "#1e88e5" },
      { id: "green", hex: "#43a047" },
      { id: "yellow", hex: "#fdd835" },
      { id: "purple", hex: "#8e24aa" },
      { id: "pink", hex: "#ff80ab" },
      { id: "black", hex: "#212121" },
      { id: "cyan", hex: "#4dd0e1" }
    ];

function shuffle(items) {
  const copiedItems = [...items];
  for (let i = copiedItems.length - 1; i > 0; i -= 1) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    [copiedItems[i], copiedItems[randomIndex]] = [copiedItems[randomIndex], copiedItems[i]];
  }
  return copiedItems;
}

export function buildCandidateQuestionPool(type) {
  const questions = [];

  COLORS.forEach((wordColor) => {
    COLORS.forEach((textColor) => {
      if (wordColor.id === textColor.id) {
        return;
      }

      const question = {
        type,
        wordColorId: wordColor.id,
        textColorId: textColor.id,
        textColorHex: textColor.hex,
        correctColorId: type === "meaning" ? wordColor.id : textColor.id
      };

      questions.push(question);
    });
  });

  return shuffle(questions).slice(0, 50);
}

const QUESTION_POOLS = {
  meaning: buildCandidateQuestionPool("meaning"),
  color: buildCandidateQuestionPool("color")
};

export function createGameQuestions() {
  const selectedMeaningQuestions = pickBalancedQuestions(QUESTION_POOLS.meaning, QUESTIONS_PER_TYPE, []);
  const selectedColorQuestions = pickBalancedQuestions(QUESTION_POOLS.color, QUESTIONS_PER_TYPE, selectedMeaningQuestions);

  return arrangeQuestionsWithLimits([...selectedMeaningQuestions, ...selectedColorQuestions]);
}

function pickBalancedQuestions(pool, count, existingQuestions) {
  const selectedQuestions = [];
  const answerCounts = countAnswers(existingQuestions);
  const shuffledPool = shuffle(pool);

  shuffledPool.forEach((question) => {
    if (selectedQuestions.length >= count) {
      return;
    }

    const currentCount = answerCounts[question.correctColorId] || 0;
    if (currentCount >= 3) {
      return;
    }

    selectedQuestions.push(question);
    answerCounts[question.correctColorId] = currentCount + 1;
  });

  if (selectedQuestions.length < count) {
    shuffledPool.forEach((question) => {
      if (selectedQuestions.length >= count) {
        return;
      }

      if (selectedQuestions.includes(question)) {
        return;
      }

      selectedQuestions.push(question);
    });
  }

  return selectedQuestions;
}

function countAnswers(questions) {
  return questions.reduce((counts, question) => {
    counts[question.correctColorId] = (counts[question.correctColorId] || 0) + 1;
    return counts;
  }, {});
}

function arrangeQuestionsWithLimits(questions) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const arrangedQuestions = buildLimitedQuestionOrder(shuffle(questions));
    if (arrangedQuestions) {
      return arrangedQuestions;
    }
  }

  return arrangeTypeLimitFallback(questions);
}

function buildLimitedQuestionOrder(questions) {
  const remainingQuestions = [...questions];
  const arrangedQuestions = [];

  function backtrack(previousAnswerId = null, previousType = null, typeStreak = 0) {
    if (remainingQuestions.length === 0) {
      return true;
    }

    const candidates = shuffle(remainingQuestions)
      .filter((question) => {
        const nextTypeStreak = question.type === previousType ? typeStreak + 1 : 1;
        return nextTypeStreak <= MAX_CONSECUTIVE_QUESTION_TYPES;
      })
      .sort((a, b) => {
        const aRepeatsAnswer = a.correctColorId === previousAnswerId ? 1 : 0;
        const bRepeatsAnswer = b.correctColorId === previousAnswerId ? 1 : 0;
        return aRepeatsAnswer - bRepeatsAnswer;
      });

    for (const candidate of candidates) {
      const nextTypeStreak = candidate.type === previousType ? typeStreak + 1 : 1;
      const questionIndex = remainingQuestions.indexOf(candidate);

      remainingQuestions.splice(questionIndex, 1);
      arrangedQuestions.push(candidate);

      if (backtrack(candidate.correctColorId, candidate.type, nextTypeStreak)) {
        return true;
      }

      arrangedQuestions.pop();
      remainingQuestions.splice(questionIndex, 0, candidate);
    }

    return false;
  }

  return backtrack() ? arrangedQuestions : null;
}

function arrangeTypeLimitFallback(questions) {
  const remainingQuestions = shuffle(questions);
  const arrangedQuestions = [];

  while (remainingQuestions.length > 0) {
    const previousQuestions = arrangedQuestions.slice(-MAX_CONSECUTIVE_QUESTION_TYPES);
    const blockedType = previousQuestions.length === MAX_CONSECUTIVE_QUESTION_TYPES && previousQuestions.every((question) => question.type === previousQuestions[0].type)
      ? previousQuestions[0].type
      : null;
    const previousQuestion = arrangedQuestions[arrangedQuestions.length - 1];
    const previousAnswerId = previousQuestion ? previousQuestion.correctColorId : null;

    const nextIndex = remainingQuestions.findIndex((question) => question.type !== blockedType && question.correctColorId !== previousAnswerId);
    const fallbackIndex = nextIndex === -1
      ? remainingQuestions.findIndex((question) => question.type !== blockedType)
      : nextIndex;
    const safeIndex = fallbackIndex === -1 ? 0 : fallbackIndex;
    const [nextQuestion] = remainingQuestions.splice(safeIndex, 1);

    arrangedQuestions.push(nextQuestion);
  }

  return arrangedQuestions;
}

export const scoreForSeconds = seconds => Math.round(seconds * SCORE_SCALE);
