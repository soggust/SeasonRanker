// What the data scripts read from their command line

// The seasons asked for: "2018-2021" (a range), "2019,2021" (a list) or one season; none, the fallback
export const seasonsArg = (arg, fallback) =>
  !arg ? [fallback] : arg.includes('-') ? (([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i))(arg.split('-').map(Number)) : arg.split(',').map(Number);
