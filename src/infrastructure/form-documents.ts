/** Official PDFs are viewed and filled locally. Exact source checksums prevent
 * a changed blank form from receiving a stale field mapping. */
import { PDFDocument } from 'pdf-lib';
import type { OfficialForm, PdfFieldValue } from '../domain/form-assistance.js';

const base = () => new URL('./', import.meta.url);
export async function loadOfficialForm(form: OfficialForm): Promise<Uint8Array> {
  const response = await fetch(new URL(form.localPath, base()));
  if (!response.ok)
    throw new Error('The official blank form is unavailable. Reconnect and try again.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 20 * 1024 * 1024) throw new Error('This form is too large to preview.');
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const actual = Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  if (actual !== form.sha256)
    throw new Error(
      'The official form changed. Use the agency version and your preparation notes.',
    );
  return bytes;
}

export async function fillOfficialForm(
  form: OfficialForm,
  values: PdfFieldValue[],
): Promise<Uint8Array> {
  if (!form.fillable)
    throw new Error('Use the official form and preparation notes for this document.');
  const document = await PDFDocument.load(await loadOfficialForm(form));
  const fields = document.getForm();
  for (const item of values) {
    if (item.type === 'text') fields.getTextField(item.name).setText(String(item.value));
    else {
      const field = fields.getCheckBox(item.name);
      if (item.value === true) field.check();
      else field.uncheck();
    }
  }
  // No flattening: users must review all questions and sign the actual form.
  return document.save();
}

export async function renderFormPage(
  bytes: Uint8Array,
  canvas: HTMLCanvasElement,
  pageNumber: number,
): Promise<number> {
  const readerUrl = new URL('./vendor/pdfjs.mjs', base()).href;
  const reader = await import(/* @vite-ignore */ readerUrl);
  reader.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.mjs', base()).href;
  const loading = reader.getDocument({ data: bytes.slice(), isEvalSupported: false });
  let document;
  try {
    document = await loading.promise;
    if (document.numPages > 100)
      throw new Error('This form has too many pages. Use the original PDF reader.');
    const number = Math.max(1, Math.min(document.numPages, Math.trunc(pageNumber) || 1));
    const page = await document.getPage(number);
    const natural = page.getViewport({ scale: 1 });
    const scale = Math.min(
      1.4,
      1200 / natural.width,
      Math.sqrt(4_000_000 / (natural.width * natural.height)),
    );
    const viewport = page.getViewport({ scale });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return document.numPages;
  } finally {
    await document?.destroy();
  }
}
