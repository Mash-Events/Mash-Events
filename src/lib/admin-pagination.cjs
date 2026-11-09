// Page maths shared by the admin lists: clamping, the "Showing 1–25 of 140"
// range and the page numbers to show (first, last, and a window around the
// current page, with gaps marked as null).

function clampPage(page, totalPages) {
  const last = Math.max(1, Number(totalPages) || 1);
  const value = Math.floor(Number(page) || 1);
  return Math.min(Math.max(value, 1), last);
}

function totalPagesFor(total, pageSize) {
  return Math.max(1, Math.ceil((Number(total) || 0) / pageSize));
}

function pageRange(page, pageSize, total) {
  const count = Number(total) || 0;
  if (!count) return { from: 0, to: 0, total: 0 };
  const from = (page - 1) * pageSize + 1;
  return { from, to: Math.min(page * pageSize, count), total: count };
}

function pageNumbers(page, totalPages) {
  const last = Math.max(1, totalPages);
  const wanted = new Set([1, last, page - 1, page, page + 1]);
  const numbers = [...wanted]
    .filter((value) => value >= 1 && value <= last)
    .sort((a, b) => a - b);
  const result = [];
  numbers.forEach((value, index) => {
    if (index > 0 && value - numbers[index - 1] > 1) result.push(null);
    result.push(value);
  });
  return result;
}

module.exports = { clampPage, pageNumbers, pageRange, totalPagesFor };
