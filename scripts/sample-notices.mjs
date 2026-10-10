// Original practice PDFs for a repeatable camera/PDF demonstration.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mkdir, writeFile } from 'node:fs/promises';
import { DEMO_NOTICES } from '../web/data.js';
await mkdir('web/samples', { recursive: true });
for (const sample of DEMO_NOTICES) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Anchor fictional practice: ${sample.title}`);
  pdf.setAuthor('Anchor project');
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([612, 792]),
    y = 730;
  function newPage() {
    page = pdf.addPage([612, 792]);
    y = 730;
  }
  const ascii = sample.text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...');
  for (const paragraph of ascii.split('\n')) {
    const words = paragraph.split(/\s+/),
      lines = [];
    let line = '';
    for (const word of words) {
      const next = line ? line + ' ' + word : word;
      if (regular.widthOfTextAtSize(next, 11) > 492) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
    for (const row of lines) {
      if (y < 65) newPage();
      if (row)
        page.drawText(row, {
          x: 60,
          y,
          size: 11,
          font: row === 'FICTIONAL PRACTICE NOTICE' ? bold : regular,
          color: rgb(0.12, 0.22, 0.21),
        });
      y -= 17;
    }
  }
  for (let index = 0; index < pdf.getPageCount(); index++)
    pdf
      .getPage(index)
      .drawText(
        `Anchor practice sample - not issued by an agency - ${index + 1}/${pdf.getPageCount()}`,
        { x: 60, y: 30, size: 8, font: regular, color: rgb(0.45, 0.5, 0.44) },
      );
  await writeFile(`dist/samples/${sample.id}.pdf`, await pdf.save());
}
console.log(`Created ${DEMO_NOTICES.length} original practice PDFs.`);
