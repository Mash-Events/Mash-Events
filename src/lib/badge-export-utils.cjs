const ExcelJS = require('exceljs');
const { escapeCsv: escapeCsvValue } = require('./csv-cell.cjs');

function buildCsvExport(rows = []) {
  if (!rows.length) {
    return '';
  }

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(escapeCsvValue).join(','),
    ...rows.map((row) =>
      headers.map((header) => escapeCsvValue(row[header])).join(',')
    ),
  ];

  return `${lines.join('\n')}\n`;
}

async function buildExcelExport(rows = []) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Badges');

  if (rows.length > 0) {
    const headers = Object.keys(rows[0]);
    worksheet.columns = headers.map((header) => ({
      header,
      key: header,
      width: Math.max(header.length + 2, 16),
    }));
    rows.forEach((row) => {
      worksheet.addRow(row);
    });
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

module.exports = {
  buildCsvExport,
  buildExcelExport,
};
