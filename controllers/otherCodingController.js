const otherCodingService = require('../services/otherCodingService');

exports.getOtherCoding = async (req, res, next) => {
  try {
    const { surveyId, questionId } = req.params;
    const result = await otherCodingService.getOtherCoding(surveyId, questionId);
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

exports.updateOtherCoding = async (req, res, next) => {
  try {
    const { surveyId, questionId } = req.params;
    const { codings } = req.body;
    const doc = await otherCodingService.updateOtherCoding(surveyId, questionId, codings, req.user.id);
    res.json(doc);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

exports.exportOtherCoding = async (req, res, next) => {
  try {
    const { surveyId, questionId } = req.params;
    const format = req.query.format || 'csv';

    const { survey, questionText, codings } = await otherCodingService.exportOtherCoding(surveyId, questionId);

    const cleanTitle = survey.title.replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanQuestion = questionText.substring(0, 30).replace(/[^a-zA-Z0-9_-]/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10);
    const baseFilename = `other_coding_${cleanTitle}_${cleanQuestion}_${dateStr}`;

    if (format === 'xlsx') {
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Other Coding');

      worksheet.columns = [
        { header: 'Answer', key: 'answer', width: 40 },
        { header: 'Value', key: 'value', width: 20 }
      ];

      worksheet.getRow(1).font = { bold: true };
      codings.forEach(c => worksheet.addRow(c));

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${baseFilename}.xlsx"`);
      await workbook.xlsx.write(res);
      return res.end();
    } else {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${baseFilename}.csv"`);
      res.write('\uFEFF');
      res.write('Answer,Value\n');
      codings.forEach(c => {
        const ansEscaped = `"${c.answer.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
        const valEscaped = `"${c.value.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
        res.write(`${ansEscaped},${valEscaped}\n`);
      });
      return res.end();
    }
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

exports.getOtherCodingQuestions = async (req, res, next) => {
  try {
    const { surveyId } = req.params;
    const questions = await otherCodingService.getOtherCodingQuestions(surveyId);
    res.json(questions);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};
