// Season year: rosters rebuild in the fall, and an FRC season is named for
// the year of its competition (fall 2026 kicks off the 2027 season). Same
// rule as the Grove's lib/access.ts.
export function seasonYearForDate(date: Date = new Date()): number {
  return date.getMonth() >= 7 ? date.getFullYear() + 1 : date.getFullYear();
}
