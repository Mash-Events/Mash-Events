const ExcelJS = require('exceljs');
const { safeCell, escapeCsv } = require('./csv-cell.cjs');

function buildRosterCsv(columns, rows) {
  return `${[
    columns.map((column) => escapeCsv(column.label)).join(','),
    ...rows.map((row) =>
      columns.map((column) => escapeCsv(row[column.key])).join(',')
    ),
  ].join('\n')}\n`;
}

async function buildRosterExcel(columns, rows, sheetName) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Mash Admin';
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31));
  sheet.columns = columns.map((column) => ({
    header: column.label,
    key: column.key,
    width: Math.min(Math.max(column.label.length + 3, 18), 44),
  }));
  rows.forEach((row) => {
    sheet.addRow(
      Object.fromEntries(
        columns.map((column) => [column.key, safeCell(row[column.key])])
      )
    );
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: 'A1',
    to: { row: 1, column: columns.length },
  };
  sheet.getRow(1).font = { bold: true };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

module.exports = { buildRosterCsv, buildRosterExcel };
