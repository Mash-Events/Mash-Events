// Spreadsheet apps run a cell that starts with = + - @ (or a tab or carriage
// return) as a formula. Several exports carry public form input, so prefix
// those cells with an apostrophe to keep them as plain text.
function safeCell(value) {
  const text = String(value ?? '');
  return /^[\s]*[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function escapeCsv(value) {
  const text = safeCell(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

module.exports = { safeCell, escapeCsv };
