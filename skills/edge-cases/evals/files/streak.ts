// Counts how many days in a row the user recorded something.
export function streak(recordedAt: string[]) {
  const days = new Set(recordedAt.map((t) => new Date(t).getDate()));
  let count = 0;
  for (let d = new Date().getDate(); days.has(d); d--) count++;
  return count;
}
