// Turning pasted or filled text into a column's value. Each returns a
// value, or the reason it refuses in words the person can act on — the
// grid shows the first refusal in its toast ("“Wood” isn't a material").

export type ParseResult<V> = { value: V } | { error: string };
export type CellParser<V> = (text: string) => ParseResult<V>;

// One of a fixed list (a status, a machine, a priority). Matches a label
// or a value, ignoring case; failing that, a start that picks out exactly
// one option ("lat" → Lathe). `empty` is what a cleared cell stores; with
// none, the column cannot be cleared.
export function parseOption<V>(
  options: readonly { value: V; label: string }[],
  { noun = "an option", empty }: { noun?: string; empty?: V } = {},
): CellParser<V> {
  return (text) => {
    const wanted = text.trim().toLowerCase();
    if (wanted === "") return empty !== undefined ? { value: empty } : { error: `This can't be left empty` };
    const exact = options.find(
      (option) => option.label.toLowerCase() === wanted || String(option.value).toLowerCase() === wanted,
    );
    if (exact) return { value: exact.value };
    // From the start of any word: "draw" finds "Needs drawing".
    const starts = options.filter((option) => {
      const words = option.label.toLowerCase().split(/\s+/);
      return words.some((_, i) => words.slice(i).join(" ").startsWith(wanted));
    });
    // Two spellings of one value (a long and a short name) are still one match.
    if (starts.length > 0 && starts.every((option) => Object.is(option.value, starts[0].value))) return { value: starts[0].value };
    return { error: `“${text.trim()}” isn't ${noun}` };
  };
}

// A number. Currency signs, thousands commas and spaces are ignored, so a
// price pasted from a spreadsheet reads. Empty stores `empty` (undefined
// by default, which a Convex patch reads as "remove the field").
export function parseNumber({
  integer = false,
  min,
  max,
  empty,
  required = false,
}: { integer?: boolean; min?: number; max?: number; empty?: number | null; required?: boolean } = {}): CellParser<
  number | null | undefined
> {
  return (text) => {
    const cleaned = text.replace(/[$€£,\s]/g, "");
    if (cleaned === "") return required ? { error: "This can't be left empty" } : { value: empty };
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return { error: `“${text.trim()}” isn't a number` };
    if (integer && !Number.isInteger(n)) return { error: `“${text.trim()}” isn't a whole number` };
    if (min !== undefined && n < min) return { error: `${n} is below ${min}` };
    if (max !== undefined && n > max) return { error: `${n} is above ${max}` };
    return { value: n };
  };
}

// Free text, trimmed. `required` refuses an empty cell.
export function parseText({ required = false, max }: { required?: boolean; max?: number } = {}): CellParser<string> {
  return (text) => {
    const value = text.trim();
    if (required && value === "") return { error: "This can't be left empty" };
    if (max !== undefined && value.length > max) return { error: `Longer than ${max} characters` };
    return { value };
  };
}
