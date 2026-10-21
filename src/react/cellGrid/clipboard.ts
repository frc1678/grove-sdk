// What a copied range looks like on the clipboard, both ways round.
//
// A copy carries two versions: tab-separated text and an HTML table. The
// table is what keeps cells as cells when it lands in Google Sheets, Excel
// or Notion; the text is what everything else reads. A paste prefers the
// HTML when the source offered one (Sheets and Excel both do), since a
// cell holding a tab or a line break survives it intact.

export type Matrix = string[][];

const tsvField = (text: string) => (/[\t\n\r"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

export function toTSV(matrix: Matrix): string {
  return matrix.map((row) => row.map(tsvField).join("\t")).join("\n");
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] ?? ch);

export function toHTML(matrix: Matrix): string {
  return `<table>${matrix.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</table>`;
}

// Spreadsheet TSV: a field in double quotes may hold tabs, line breaks and
// doubled quotes. One trailing line break (Excel adds it) is not a row.
export function parseTSV(input: string): Matrix {
  let text = input.replace(/\r\n?/g, "\n");
  if (text.endsWith("\n")) text = text.slice(0, -1);
  const rows: Matrix = [[]];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === "\t") {
      rows[rows.length - 1].push(field);
      field = "";
    } else if (ch === "\n") {
      rows[rows.length - 1].push(field);
      field = "";
      rows.push([]);
    } else field += ch;
  }
  rows[rows.length - 1].push(field);
  return rows;
}

// The rows of the first table in some HTML, or null when it has none (a
// paste from a web page's prose). Whitespace inside a cell collapses the
// way the browser would have shown it.
export function parseClipboardHTML(html: string): Matrix | null {
  if (typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const rows = [...doc.querySelectorAll("tr")];
  if (rows.length === 0) return null;
  return rows.map((tr) =>
    [...tr.querySelectorAll("td, th")].map((cell) => (cell.textContent ?? "").replace(/\s+/g, " ").trim()),
  );
}

export function readClipboard(data: Pick<DataTransfer, "getData">): Matrix | null {
  const html = data.getData("text/html");
  const fromHtml = html ? parseClipboardHTML(html) : null;
  if (fromHtml !== null) return fromHtml;
  const text = data.getData("text/plain");
  return text ? parseTSV(text) : null;
}
