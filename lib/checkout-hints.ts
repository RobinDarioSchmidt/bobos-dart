export type FinishMode = "single" | "double" | "master";

type ThrowOption = {
  label: string;
  score: number;
  multiplier: 1 | 2 | 3;
};

const THROW_OPTIONS: ThrowOption[] = [
  ...Array.from({ length: 20 }, (_, index) => ({
    label: `${index + 1}`,
    score: index + 1,
    multiplier: 1 as const,
  })),
  ...Array.from({ length: 20 }, (_, index) => ({
    label: `D${index + 1}`,
    score: (index + 1) * 2,
    multiplier: 2 as const,
  })),
  ...Array.from({ length: 20 }, (_, index) => ({
    label: `T${index + 1}`,
    score: (index + 1) * 3,
    multiplier: 3 as const,
  })),
  {
    label: "25",
    score: 25,
    multiplier: 1,
  },
  {
    label: "Bull",
    score: 50,
    multiplier: 2,
  },
];

const checkoutCache = new Map<string, string[]>();

function canFinishWithThrow(throwOption: ThrowOption, finishMode: FinishMode) {
  if (finishMode === "single") {
    return true;
  }

  if (finishMode === "double") {
    return throwOption.multiplier === 2;
  }

  return throwOption.multiplier === 2 || throwOption.multiplier === 3;
}

function getCheckoutThreshold(finishMode: FinishMode) {
  if (finishMode === "double") {
    return 170;
  }

  return 180;
}

function routeWeight(route: ThrowOption[]) {
  return route.reduce((sum, entry, index) => {
    const finishingBonus = index === route.length - 1 ? entry.multiplier * 100 : 0;
    return sum + entry.score + entry.multiplier * 10 + finishingBonus;
  }, 0);
}

export function getCheckoutSuggestions(score: number, finishMode: FinishMode, limit = 3) {
  const cacheKey = `${finishMode}:${score}:${limit}`;
  const cached = checkoutCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  if (score < 2 || score > getCheckoutThreshold(finishMode)) {
    return [];
  }

  const routes: Array<{ labels: string[]; weight: number }> = [];

  for (const first of THROW_OPTIONS) {
    if (first.score === score && canFinishWithThrow(first, finishMode)) {
      routes.push({ labels: [first.label], weight: routeWeight([first]) });
    }

    for (const second of THROW_OPTIONS) {
      if (first.score + second.score === score && canFinishWithThrow(second, finishMode)) {
        routes.push({ labels: [first.label, second.label], weight: routeWeight([first, second]) });
      }

      for (const third of THROW_OPTIONS) {
        if (first.score + second.score + third.score === score && canFinishWithThrow(third, finishMode)) {
          routes.push({
            labels: [first.label, second.label, third.label],
            weight: routeWeight([first, second, third]),
          });
        }
      }
    }
  }

  const unique = Array.from(
    new Map(
      routes
        .sort((left, right) => {
          if (left.labels.length !== right.labels.length) {
            return left.labels.length - right.labels.length;
          }

          return right.weight - left.weight;
        })
        .map((route) => [route.labels.join(", "), route.labels.join(", ")]),
    ).values(),
  ).slice(0, limit);

  checkoutCache.set(cacheKey, unique);
  return unique;
}
