// Helpers for the sports' data scripts (apps/<sport>/scripts/update-data.mjs)

// Grades on a curve (0 = F ... 12 = A+) from scores (higher = better): the best gets 12, the worst 0,
// evenly between. The support grades (a lineup, a supporting cast, a coaching job) are made this way.
// scores: Map of key -> score (scores that aren't numbers get no grade)
export function curve(scores) {
  const ranked = [...scores].filter(([, v]) => Number.isFinite(v)).sort((a, b) => b[1] - a[1]);
  const last = Math.max(ranked.length - 1, 1);
  return new Map(ranked.map(([key], rank) => [key, Math.round(12 * (1 - rank / last) * 10) / 10]));
}

// Each key's place on that curve (the same sort): key -> { rank, of }, #1 the A+ (what a grade's
// breakdown shows: engine/grade-why.ts)
export function curvePlaces(scores) {
  const ranked = [...scores].filter(([, v]) => Number.isFinite(v)).sort((a, b) => b[1] - a[1]);
  return new Map(ranked.map(([key], rank) => [key, { rank: rank + 1, of: ranked.length }]));
}

// A support grade's inputs, kept on the unit beside the grade (unit.gradeIn[key]): the score it was
// curved on, as it reads (a lower-is-better score unflipped), and its place, [score, rank, of]; early in
// a season early-season.mjs adds last season's grade and this season's share. Nothing for a unit the
// curve didn't grade. The site's grade breakdown reads it (engine/grade-why.ts dataGradeWhy).
export function keepGradeInput(unit, key, score, place) {
  if (!place || !Number.isFinite(score)) return;
  unit.gradeIn = { ...unit.gradeIn, [key]: [Number(score.toPrecision(4)), place.rank, place.of] };
}
