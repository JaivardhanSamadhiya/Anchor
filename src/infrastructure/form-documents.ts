/** Official PDFs are viewed and filled locally. Exact checksums prevent a changed
 * blank form from receiving a stale mapping. Private draft bytes are never cached. */
import {
  PDFDocument,
  PDFName,
  StandardFonts,
  layoutCombedText,
  layoutMultilineText,
  layoutSinglelineText,
} from 'pdf-lib';
import type { PDFFont, PDFTextField } from 'pdf-lib';
import { officialFormFields } from '../domain/form-assistance.js';
import type { OfficialForm, PdfFieldValue } from '../domain/form-assistance.js';

const base = () => new URL('./', import.meta.url);
const blankForms = new Map<string, Promise<Uint8Array>>();
async function verifiedBlank(path: string, sha256: string): Promise<Uint8Array> {
  const key = `${path}:${sha256}`;
  let pending = blankForms.get(key);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(new URL(path, base()));
      if (!response.ok)
        throw new Error('The official blank form is unavailable. Reconnect and try again.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > 20 * 1024 * 1024)
        throw new Error('This form is too large to preview.');
      const hash = await crypto.subtle.digest('SHA-256', bytes);
      const actual = Array.from(new Uint8Array(hash), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');
      if (actual !== sha256)
        throw new Error('The official form changed. Use the agency version and your saved draft.');
      return bytes;
    })();
    blankForms.set(key, pending);
    pending.catch(() => blankForms.delete(key));
  }
  // A PDF reader may transfer its buffer to a worker. Never expose the cache's buffer.
  return (await pending).slice();
}
export async function loadOfficialForm(form: OfficialForm): Promise<Uint8Array> {
  return verifiedBlank(form.localPath, form.sha256);
}

function readableFontSize(field: PDFTextField, value: string, font: PDFFont): number {
  const widgets = field.acroField.getWidgets();
  if (!widgets.length) throw new Error('The PDF answer has no visible field.');
  for (let size = 12; size >= 8; size -= 0.5) {
    const fits = widgets.every((widget) => {
      const rectangle = widget.getRectangle();
      const border = widget.getBorderStyle()?.getWidth() ?? 0;
      const inset = border + (field.isCombed() ? 0 : 1);
      const bounds = {
        x: inset,
        y: inset,
        width: rectangle.width - inset * 2,
        height: rectangle.height - inset * 2,
      };
      if (field.isMultiline()) {
        const layout = layoutMultilineText(value, {
          alignment: field.getAlignment(),
          fontSize: size,
          font,
          bounds,
        });
        return layout.lines.every(
          (line) =>
            line.width <= bounds.width + 0.01 &&
            line.y >= bounds.y - 0.01 &&
            line.y + line.height <= bounds.y + bounds.height + 0.01,
        );
      }
      if (field.isCombed()) {
        const layout = layoutCombedText(value, {
          fontSize: size,
          font,
          bounds,
          cellCount: field.getMaxLength() ?? 0,
        });
        return layout.cells.every(
          (cell) =>
            cell.width <= bounds.width / (field.getMaxLength() ?? 1) &&
            cell.height <= bounds.height,
        );
      }
      const layout = layoutSinglelineText(value, {
        alignment: field.getAlignment(),
        fontSize: size,
        font,
        bounds,
      });
      return layout.line.width <= bounds.width + 0.01 && layout.line.height <= bounds.height + 0.01;
    });
    if (fits) return size;
  }
  throw new Error(
    'This answer is too long for its PDF box. Shorten it or use the next line / an extra sheet.',
  );
}

export async function fillOfficialForm(
  form: OfficialForm,
  values: PdfFieldValue[],
): Promise<Uint8Array> {
  if (!form.fillable) throw new Error('Use the official form and saved draft for this document.');
  const bytes =
    form.editablePath && form.editableSha256
      ? await verifiedBlank(form.editablePath, form.editableSha256)
      : await loadOfficialForm(form);
  const document = await PDFDocument.load(bytes);
  if (document.getPageCount() !== form.pages)
    throw new Error('The official form page count changed.');
  const fields = document.getForm();
  const allowed = new Map<string, 'text' | 'checkbox'>();
  for (const field of officialFormFields(form.id)) {
    for (const name of field.pdfText ?? []) allowed.set(name, 'text');
    for (const name of Object.values(field.pdfChecks ?? {}).flat()) allowed.set(name, 'checkbox');
  }
  const font = await document.embedFont(StandardFonts.Helvetica);
  const expected = new Map<string, PdfFieldValue>();
  for (const item of values) {
    if (allowed.get(item.name) !== item.type)
      throw new Error('This answer does not have a verified field mapping.');
    if (expected.has(item.name) && expected.get(item.name)?.value !== item.value)
      throw new Error('Two answers target the same PDF field.');
    expected.set(item.name, item);
    try {
      if (item.type === 'text') {
        if (typeof item.value !== 'string') throw new Error('Enter text for this answer.');
        const field = fields.getTextField(item.name);
        if (field.getMaxLength() !== undefined && item.value.length > field.getMaxLength()!)
          throw new Error(`Use no more than ${field.getMaxLength()} characters for this PDF box.`);
        if (!field.isMultiline() && /[\r\n]/.test(item.value))
          throw new Error('Use the next line for additional text.');
        // Encode before writing; unsupported glyphs must produce a clear error, never disappear.
        try {
          font.encodeText(item.value.replace(/[\r\n]/g, ''));
        } catch {
          throw new Error(
            'This PDF font cannot display one of these characters. Use the downloaded form in a PDF editor for this answer.',
          );
        }
        const size = readableFontSize(field, item.value, font);
        field.setText(item.value);
        // SAR 7's source has empty default appearances on some fields. Supply
        // a valid text operator before regenerating their visible appearances.
        field.acroField.setDefaultAppearance(`/${font.name} ${size} Tf 0 g`);
        for (const widget of field.acroField.getWidgets()) {
          // Some official fields merge the widget and canonical field into one
          // dictionary. Deleting DA there would discard our readable font size.
          if (widget.dict !== field.acroField.dict) widget.dict.delete(PDFName.of('DA'));
        }
        field.updateAppearances(font);
      } else {
        if (typeof item.value !== 'boolean') throw new Error('Choose a valid checkbox answer.');
        const field = fields.getCheckBox(item.name);
        if (item.value) field.check();
        else field.uncheck();
        field.updateAppearances();
      }
      // CF 37 hides conditional widgets until its Acrobat scripts run. Our
      // local guide already checks those conditions; make only emitted fields
      // visible and printable in readers that do not execute PDF JavaScript.
      const written = fields.getField(item.name);
      for (const widget of written.acroField.getWidgets())
        widget.setFlags((widget.getFlags() | 4) & ~(1 | 2 | 32));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'This answer could not be written to the PDF.';
      throw new Error(`${item.label ?? 'An answer'}: ${message}`);
    }
  }
  // Retain widgets and the canonical AcroForm tree. Signatures and signing dates
  // are excluded from the reviewed mapping; the resident completes them directly.
  const result = await document.save({ updateFieldAppearances: false });
  const saved = await PDFDocument.load(result);
  const savedFields = saved.getForm();
  for (const item of expected.values()) {
    const field =
      item.type === 'text'
        ? savedFields.getTextField(item.name)
        : savedFields.getCheckBox(item.name);
    const actual =
      item.type === 'text'
        ? (savedFields.getTextField(item.name).getText() ?? '')
        : savedFields.getCheckBox(item.name).isChecked();
    if (
      actual !== item.value ||
      field.acroField.getWidgets().some((widget) => !widget.getAppearances()?.normal)
    )
      throw new Error('The PDF could not preserve an answer. Your saved draft is still available.');
  }
  return result;
}

const textObservers = new WeakMap<HTMLElement, ResizeObserver>();
export async function renderFormPage(
  bytes: Uint8Array,
  canvas: HTMLCanvasElement,
  pageNumber: number,
  textLayer?: HTMLElement,
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
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not display the PDF page.');
    await page.render({ canvasContext: context, viewport }).promise;
    if (textLayer) {
      textObservers.get(textLayer)?.disconnect();
      textLayer.replaceChildren();
      textLayer.classList.add('textLayer');
      textLayer.style.cssText =
        'position:absolute;inset:0;overflow:clip;line-height:1;text-align:initial;transform-origin:0 0;user-select:text;';
      textLayer.setAttribute('aria-label', `Selectable PDF text, page ${number}`);
      textLayer.style.setProperty('--scale-factor', String(scale));
      const text = new reader.TextLayer({
        textContentSource: await page.getTextContent(),
        container: textLayer,
        viewport,
      });
      await text.render();
      for (const span of textLayer.querySelectorAll<HTMLElement>('span,br')) {
        span.style.color = 'transparent';
        span.style.position = 'absolute';
        span.style.whiteSpace = 'pre';
        span.style.cursor = 'text';
        span.style.transformOrigin = '0% 0%';
      }
      const sync = () => {
        const displayed = canvas.getBoundingClientRect();
        textLayer.style.width = `${displayed.width}px`;
        textLayer.style.height = `${displayed.height}px`;
        textLayer.style.setProperty('--scale-factor', String(displayed.width / natural.width));
      };
      sync();
      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(() => {
          if (!canvas.isConnected || !textLayer.isConnected) {
            observer.disconnect();
            return;
          }
          sync();
        });
        observer.observe(canvas);
        textObservers.set(textLayer, observer);
      }
    }
    return document.numPages;
  } finally {
    await document?.destroy();
  }
}
