/**
 * Assemble a shareable, printable appointment packet entirely on this device.
 * Files are included only by explicit ID selection. Official interactive forms
 * remain separate downloads: copying their pages would lose the AcroForm tree.
 */
import { PDFArray, PDFDict, PDFDocument, PDFName, StandardFonts, rgb } from 'pdf-lib';
import type { PDFFont, PDFPage } from 'pdf-lib';
import {
  APPOINTMENT_PACKET_LIMITS as LIMITS,
  validateAppointmentPacketInput,
} from '../domain/appointment-packet.js';
import type {
  AppointmentAttachment,
  AppointmentPacketInput,
  PacketLanguage,
} from '../domain/appointment-packet.js';
export {
  createAppointmentPacketInput,
  APPOINTMENT_PACKET_LIMITS,
} from '../domain/appointment-packet.js';

const PAGE = { width: 612, height: 792, margin: 48, bottom: 62, top: 728 };
const COLORS = {
  ink: rgb(0.13, 0.22, 0.25),
  muted: rgb(0.34, 0.42, 0.43),
  teal: rgb(0.09, 0.38, 0.35),
  soft: rgb(0.93, 0.96, 0.95),
  line: rgb(0.81, 0.87, 0.85),
};
type Fonts = { regular: PDFFont; bold: PDFFont };
type ContentsEntry = { label: string; page: number };
type PreparedAttachment = {
  attachment: AppointmentAttachment;
  document?: PDFDocument;
  text?: string;
  imageBytes?: Uint8Array;
  separate?: boolean;
};

const tr = (language: PacketLanguage, english: string, spanish: string): string =>
  language === 'es' ? spanish : english;

/** Typography substitutions retain words while matching the standard PDF font. */
function readableText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/\t/g, '    ')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '');
}

function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const value = readableText(text);
  try {
    font.encodeText(value.replace(/\n/g, ''));
  } catch {
    throw new Error(
      'One of the selected texts uses characters this PDF font cannot display. Keep that original file separate, or use Latin-script text for this packet. / Uno de los textos contiene caracteres que esta fuente no puede mostrar. Conserva ese original por separado.',
    );
  }
  const lines: string[] = [];
  for (const paragraph of value.split('\n')) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.trim().split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) {
        lines.push(line);
        line = '';
      }
      // Unbroken reference numbers and URLs wrap instead of crossing the margin.
      let fragment = '';
      for (const character of word) {
        if (fragment && font.widthOfTextAtSize(fragment + character, size) > width) {
          lines.push(fragment);
          fragment = '';
        }
        fragment += character;
      }
      line = fragment;
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [''];
}

class PacketWriter {
  page!: PDFPage;
  y = PAGE.top;
  readonly generatedPages: PDFPage[] = [];
  constructor(
    readonly document: PDFDocument,
    readonly fonts: Fonts,
    readonly language: PacketLanguage,
  ) {}
  newPage(header = true): PDFPage {
    if (this.document.getPageCount() >= LIMITS.packetPages)
      throw new Error('This packet would exceed 100 pages. Select fewer notices or files.');
    this.page = this.document.addPage([PAGE.width, PAGE.height]);
    this.generatedPages.push(this.page);
    this.y = PAGE.top;
    if (header) {
      this.page.drawText('ANCHOR', {
        x: PAGE.margin,
        y: 754,
        size: 9,
        font: this.fonts.bold,
        color: COLORS.teal,
      });
      this.page.drawText(tr(this.language, 'Appointment packet', 'Carpeta para la cita'), {
        x: 113,
        y: 754,
        size: 9,
        font: this.fonts.regular,
        color: COLORS.muted,
      });
      this.page.drawLine({
        start: { x: PAGE.margin, y: 743 },
        end: { x: PAGE.width - PAGE.margin, y: 743 },
        thickness: 0.6,
        color: COLORS.line,
      });
    }
    return this.page;
  }
  room(height: number): void {
    if (!this.page || this.y - height < PAGE.bottom) this.newPage();
  }
  text(
    text: string,
    options: { bold?: boolean; size?: number; indent?: number; gap?: number } = {},
  ): void {
    const size = options.size ?? 10;
    const lineHeight = size * 1.4;
    const indent = options.indent ?? 0;
    const font = options.bold ? this.fonts.bold : this.fonts.regular;
    for (const line of wrapText(text, font, size, PAGE.width - 2 * PAGE.margin - indent)) {
      this.room(lineHeight);
      if (line)
        this.page.drawText(line, {
          x: PAGE.margin + indent,
          y: this.y,
          font,
          size,
          color: options.bold ? COLORS.ink : COLORS.muted,
        });
      this.y -= lineHeight;
    }
    this.y -= options.gap ?? 5;
  }
  heading(text: string, size = 17): void {
    this.room(64);
    this.text(text, { bold: true, size, gap: 12 });
  }
  entry(label: string, entries: ContentsEntry[]): void {
    this.room(70);
    entries.push({ label, page: this.document.getPageCount() });
    this.heading(label);
  }
}

function separateFormLabel(language: PacketLanguage): string {
  return tr(
    language,
    'Separate editable download - not merged into this packet. Review, sign and date the official form yourself.',
    'Descarga editable por separado - no se combina con esta carpeta. Revisa, firma y fecha el formulario oficial personalmente.',
  );
}

/** Remove EXIF/IPTC/comment metadata from a JPEG without changing its pixels. */
function jpegWithoutPrivateMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8)
    throw new Error('This selected JPEG is not readable.');
  const segments: Uint8Array[] = [bytes.slice(0, 2)];
  let index = 2;
  while (index < bytes.length) {
    const start = index;
    if (bytes[index++] !== 0xff) throw new Error('This selected JPEG is not readable.');
    while (bytes[index] === 0xff) index++;
    const marker = bytes[index++];
    if (marker === 0xda || marker === 0xd9) {
      segments.push(bytes.slice(start));
      break;
    }
    if (marker == null || index + 2 > bytes.length)
      throw new Error('This selected JPEG is incomplete.');
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      segments.push(bytes.slice(start, index));
      continue;
    }
    const length = bytes[index] * 256 + bytes[index + 1];
    if (length < 2 || index + length > bytes.length)
      throw new Error('This selected JPEG is incomplete.');
    index += length;
    if (![0xe1, 0xed, 0xfe].includes(marker)) segments.push(bytes.slice(start, index));
  }
  const result = new Uint8Array(segments.reduce((total, segment) => total + segment.length, 0));
  let offset = 0;
  for (const segment of segments) {
    result.set(segment, offset);
    offset += segment.length;
  }
  return result;
}

async function prepareAttachments(
  input: AppointmentPacketInput,
  attachments: AppointmentAttachment[],
): Promise<PreparedAttachment[]> {
  const selected = new Set(input.selectedAttachmentIds);
  const result: PreparedAttachment[] = [];
  let totalBytes = 0;
  for (const id of selected) {
    const matches = attachments.filter((attachment) => attachment.id === id);
    if (matches.length !== 1)
      throw new Error('A selected file is unavailable or duplicated. Refresh the packet choices.');
    const attachment = matches[0];
    if (!attachment.name || attachment.name.length > 300)
      throw new Error('A selected file needs a name of up to 300 characters.');
    if (attachment.role === 'official-form' || attachment.unsignedEditableDownloadSeparate) {
      result.push({ attachment, separate: true });
      continue;
    }
    const bytes = attachment.bytes;
    if (!(bytes instanceof Uint8Array) || !bytes.byteLength)
      throw new Error('A selected file is empty or unavailable. Download its original separately.');
    if (bytes.byteLength > LIMITS.attachmentBytes)
      throw new Error('A selected file is larger than 20 MB. Choose a smaller file.');
    totalBytes += bytes.byteLength;
    if (totalBytes > LIMITS.totalAttachmentBytes)
      throw new Error('Selected files exceed 40 MB. Create a smaller appointment packet.');
    if (attachment.mimeType === 'application/pdf') {
      let document: PDFDocument;
      try {
        document = await PDFDocument.load(bytes, { updateMetadata: false });
      } catch {
        throw new Error(
          `${attachment.name}: This PDF cannot be read or is encrypted. Download the original separately.`,
        );
      }
      if (document.getPageCount() < 1 || document.getPageCount() > LIMITS.attachmentPages)
        throw new Error(`${attachment.name}: Choose a PDF with 1 to 60 pages.`);
      const fields = document.catalog
        .lookupMaybe(PDFName.of('AcroForm'), PDFDict)
        ?.lookupMaybe(PDFName.of('Fields'), PDFArray);
      const hasWidgets = document.getPages().some((page) =>
        (page.node.Annots()?.asArray() ?? []).some((reference) => {
          const annotation = document.context.lookup(reference);
          return (
            annotation instanceof PDFDict &&
            annotation.lookupMaybe(PDFName.of('Subtype'), PDFName)?.toString() === '/Widget'
          );
        }),
      );
      if ((fields?.size() ?? 0) > 0 || hasWidgets)
        throw new Error(
          `${attachment.name}: Keep editable or signed forms as separate original downloads. Their fields cannot be safely merged into a packet.`,
        );
      result.push({ attachment, document });
    } else if (attachment.mimeType === 'text/plain') {
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        throw new Error(
          `${attachment.name}: Save this text as UTF-8 or download its original separately.`,
        );
      }
      if (text.length > LIMITS.textAttachmentCharacters)
        throw new Error(`${attachment.name}: Choose a text file with up to 40,000 characters.`);
      result.push({ attachment, text });
    } else if (attachment.mimeType === 'image/jpeg') {
      result.push({ attachment, imageBytes: jpegWithoutPrivateMetadata(bytes) });
    } else if (attachment.mimeType === 'image/png') {
      // Bound decoded PNG dimensions before the PDF library allocates pixels.
      if (
        bytes.length < 24 ||
        bytes[0] !== 137 ||
        bytes[1] !== 80 ||
        bytes[2] !== 78 ||
        bytes[3] !== 71
      )
        throw new Error(`${attachment.name}: This PNG is not readable.`);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const width = view.getUint32(16);
      const height = view.getUint32(20);
      if (!width || !height || width > 12_000 || height > 12_000 || width * height > 32_000_000)
        throw new Error(`${attachment.name}: Resize this image before creating the packet.`);
      result.push({ attachment, imageBytes: bytes });
    } else {
      throw new Error(
        `${attachment.name}: Use PDF, PNG, JPEG or UTF-8 text in this packet. Download other originals separately.`,
      );
    }
  }
  return result;
}

function addCover(writer: PacketWriter, input: AppointmentPacketInput): void {
  writer.newPage(false);
  writer.page.drawRectangle({ x: 0, y: 678, width: PAGE.width, height: 114, color: COLORS.teal });
  writer.page.drawText('ANCHOR', {
    x: PAGE.margin,
    y: 753,
    size: 11,
    font: writer.fonts.bold,
    color: rgb(1, 1, 1),
  });
  writer.page.drawText(
    tr(input.language, 'Ready for your appointment', 'Todo listo para tu cita'),
    {
      x: PAGE.margin,
      y: 706,
      size: 23,
      font: writer.fonts.bold,
      color: rgb(1, 1, 1),
    },
  );
  writer.y = 644;
  writer.text(
    tr(
      input.language,
      'A packet you choose, review and share.',
      'Una carpeta que tú eliges, revisas y compartes.',
    ),
    { bold: true, size: 17, gap: 15 },
  );
  writer.text(`${tr(input.language, 'Prepared', 'Preparado')}: ${input.createdAt.slice(0, 10)}`);
  if (input.residentName)
    writer.text(`${tr(input.language, 'Prepared for', 'Preparado para')}: ${input.residentName}`);
  if (input.appointment?.date)
    writer.text(`${tr(input.language, 'Appointment', 'Cita')}: ${input.appointment.date}`);
  if (input.appointment?.location)
    writer.text(`${tr(input.language, 'Location', 'Lugar')}: ${input.appointment.location}`);
  writer.y -= 15;
  writer.heading(tr(input.language, 'Before you share', 'Antes de compartir'), 14);
  writer.text(
    tr(
      input.language,
      'Review every page. This packet may contain private information from the notices and files you selected. Share it only with the person or agency you choose.',
      'Revisa todas las páginas. Esta carpeta puede contener información privada de los avisos y archivos que seleccionaste. Compártela solamente con la persona o agencia que elijas.',
    ),
  );
  writer.text(
    tr(
      input.language,
      'Anchor prepares paperwork; creating or downloading this packet does not submit it, verify delivery, determine eligibility or prove agency acceptance.',
      'Anchor ayuda a preparar los documentos. Crear o descargar esta carpeta no los envía, no verifica la entrega, no determina elegibilidad ni demuestra aceptación de la agencia.',
    ),
  );
  writer.text(
    tr(
      input.language,
      'Official editable forms remain separate original downloads. Review all pages, sign and date them yourself when required, and use an accepted official channel.',
      'Los formularios oficiales editables se descargan por separado. Revisa todas sus páginas, fírmalos y féchalos personalmente cuando corresponda y usa un canal oficial aceptado.',
    ),
  );
  writer.text(
    tr(
      input.language,
      'No files are sent anywhere by this download. Source attachments are unchanged in your workspace.',
      'Esta descarga no envía archivos a ningún servicio. Los originales en tu espacio permanecen sin cambios.',
    ),
  );
}

function contentsRows(
  entries: ContentsEntry[],
  fonts: Fonts,
): { entry: ContentsEntry; lines: string[]; height: number }[] {
  return entries.map((entry) => {
    const lines = wrapText(entry.label, fonts.regular, 10, PAGE.width - 2 * PAGE.margin - 58);
    return { entry, lines, height: lines.length * 14 + 12 };
  });
}

function addContents(writer: PacketWriter, entries: ContentsEntry[]): void {
  const rows = contentsRows(entries, writer.fonts);
  let needed = 1;
  const available = PAGE.top - PAGE.bottom - (17 * 1.4 + 12);
  let remaining = available;
  for (const row of rows) {
    if (row.height > remaining) {
      needed++;
      remaining = available;
    }
    remaining -= row.height;
  }
  const pages: PDFPage[] = [];
  writer.newPage();
  pages.push(writer.page);
  writer.heading(tr(writer.language, 'Contents', 'Contenido'));
  for (const row of rows) {
    if (writer.y - row.height < PAGE.bottom) {
      writer.newPage();
      pages.push(writer.page);
      writer.heading(tr(writer.language, 'Contents continued', 'Continuación del contenido'));
    }
    const firstY = writer.y;
    for (const line of row.lines) {
      writer.page.drawText(line, {
        x: PAGE.margin,
        y: writer.y,
        size: 10,
        font: writer.fonts.regular,
        color: COLORS.ink,
      });
      writer.y -= 14;
    }
    const number = String(row.entry.page + needed);
    writer.page.drawText(number, {
      x: PAGE.width - PAGE.margin - writer.fonts.bold.widthOfTextAtSize(number, 10),
      y: firstY,
      size: 10,
      font: writer.fonts.bold,
      color: COLORS.teal,
    });
    writer.y -= 12;
  }
  // Move the newly generated contents immediately after the cover. Their page
  // references remain valid; page numbers above include this insertion offset.
  if (pages.length !== needed) throw new Error('The packet contents could not be paginated.');
  for (let index = pages.length - 1; index >= 0; index--)
    writer.document.removePage(writer.document.getPageCount() - 1);
  for (let index = 0; index < pages.length; index++)
    writer.document.insertPage(index + 1, pages[index]);
}

export async function buildAppointmentPacket(
  input: AppointmentPacketInput,
  attachments: AppointmentAttachment[] = [],
): Promise<Uint8Array> {
  validateAppointmentPacketInput(input);
  const chosen = await prepareAttachments(input, attachments);
  const document = await PDFDocument.create();
  const fonts = {
    regular: await document.embedFont(StandardFonts.Helvetica),
    bold: await document.embedFont(StandardFonts.HelveticaBold),
  };
  const writer = new PacketWriter(document, fonts, input.language);
  const entries: ContentsEntry[] = [];
  const t = (english: string, spanish: string) => tr(input.language, english, spanish);
  document.setTitle(t('Anchor appointment packet', 'Carpeta de Anchor para la cita'));
  document.setAuthor('Anchor');
  document.setSubject('Resident-selected appointment preparation');
  document.setCreator('Anchor local PDF tools');
  document.setProducer('Anchor local PDF tools');
  document.setKeywords(['appointment', 'resident-selected']);
  document.setCreationDate(new Date(input.createdAt));
  document.setModificationDate(new Date(input.createdAt));
  addCover(writer, input);
  writer.newPage();
  writer.entry(t('Selected notices and requests', 'Avisos y solicitudes seleccionados'), entries);
  if (!input.notices.length)
    writer.text(t('No notices were selected.', 'No se seleccionaron avisos.'));
  for (const notice of input.notices) {
    writer.room(90);
    entries.push({ label: notice.title, page: document.getPageCount() });
    writer.heading(notice.title, 13);
    if (notice.program || notice.county)
      writer.text([notice.program, notice.county].filter(Boolean).join(' / '));
    writer.text(
      notice.reviewed
        ? t('Notice review: checked by you.', 'Revisión del aviso: verificado por ti.')
        : t(
            'Notice review: not yet checked. Ask for help confirming its contents.',
            'Revisión del aviso: pendiente. Pide ayuda para confirmar su contenido.',
          ),
      { bold: true },
    );
    for (const deadline of notice.deadlines.filter((item) => !item.excluded)) {
      writer.text(
        `${deadline.label || deadline.kind || t('Date', 'Fecha')}: ${deadline.date || t('Not established', 'No establecida')} - ${deadline.confirmed ? t('confirmed by you', 'confirmada por ti') : t('needs confirmation', 'necesita confirmación')}`,
      );
    }
    if (!notice.requests.length)
      writer.text(
        t(
          'No definite requests were recorded. Review the original notice.',
          'No se registraron solicitudes claras. Revisa el aviso original.',
        ),
      );
    for (const request of notice.requests) {
      writer.room(45);
      writer.text(`${request.status === 'done' ? '[x]' : '[ ]'} ${request.title}`, { bold: true });
      writer.text(
        request.status === 'done'
          ? t(
              'Prepared by you; submission is recorded separately.',
              'Preparado por ti; el envío se registra por separado.',
            )
          : t('Preparation still to check.', 'Preparación pendiente de verificar.'),
        { indent: 18 },
      );
      if (request.quote)
        writer.text(
          `${t('Original wording', 'Texto original')}${request.line ? ` (${t('line', 'línea')} ${request.line})` : ''}: "${request.quote}"`,
          { indent: 18 },
        );
    }
    writer.y -= 12;
  }
  writer.entry(t('Questions for the appointment', 'Preguntas para la cita'), entries);
  if (!input.questions.some((question) => question.trim()))
    writer.text(
      t(
        'No questions added. Bring your original notice if you need clarification.',
        'No agregaste preguntas. Lleva el aviso original si necesitas aclaraciones.',
      ),
    );
  for (const [index, question] of input.questions.filter((value) => value.trim()).entries())
    writer.text(`${index + 1}. ${question}`);
  if (input.includeSubmissionHistory) {
    writer.entry(t('Your submission records', 'Tus registros de envío'), entries);
    writer.text(
      t(
        'These are your own records. Anchor has not independently verified receipt or acceptance.',
        'Estos son tus propios registros. Anchor no ha verificado de manera independiente la recepción ni la aceptación.',
      ),
    );
    if (!input.submissions.length)
      writer.text(t('No submission records selected.', 'No se seleccionaron registros de envío.'));
    for (const event of input.submissions) {
      writer.text(
        `${event.date.slice(0, 10)}: ${event.title || t('Submission record', 'Registro de envío')}`,
        { bold: true },
      );
      if (event.detail) writer.text(event.detail, { indent: 18 });
      if (event.attachmentId)
        writer.text(
          input.selectedAttachmentIds.includes(event.attachmentId)
            ? t(
                'The associated file was selected for this packet.',
                'El archivo relacionado fue seleccionado para esta carpeta.',
              )
            : t(
                'The associated file was not selected for this packet.',
                'El archivo relacionado no fue seleccionado para esta carpeta.',
              ),
          { indent: 18 },
        );
    }
  }
  writer.entry(t('Selected file manifest', 'Lista de archivos seleccionados'), entries);
  if (!chosen.length)
    writer.text(
      t('No supporting files were selected.', 'No se seleccionaron archivos de respaldo.'),
    );
  for (const item of chosen) {
    writer.text(item.attachment.name, { bold: true });
    writer.text(
      item.separate
        ? separateFormLabel(input.language)
        : t('Included in the appendix below.', 'Incluido en el apéndice a continuación.'),
      { indent: 18 },
    );
  }
  for (const item of chosen.filter((attachment) => !attachment.separate)) {
    writer.newPage();
    writer.entry(`${t('File', 'Archivo')}: ${item.attachment.name}`, entries);
    if (item.document) {
      writer.text(
        t(
          'The following pages are a printable copy of your selected PDF. Keep its original separately.',
          'Las páginas siguientes son una copia imprimible del PDF seleccionado. Conserva el original por separado.',
        ),
      );
      if (document.getPageCount() + item.document.getPageCount() > LIMITS.packetPages - 1)
        throw new Error('This packet would exceed 100 pages. Select fewer files.');
      const copied = await document.copyPages(item.document, item.document.getPageIndices());
      for (const page of copied) {
        // No executable actions, links, comments or widget dictionaries travel
        // into the printable copy; the original attachment remains untouched.
        page.node.delete(PDFName.of('Annots'));
        page.node.delete(PDFName.of('AA'));
        page.node.delete(PDFName.of('Metadata'));
        page.node.delete(PDFName.of('PieceInfo'));
        document.addPage(page);
      }
    } else if (item.text !== undefined) {
      writer.text(item.text, { size: 10, gap: 0 });
    } else if (item.imageBytes) {
      let image;
      try {
        image =
          item.attachment.mimeType === 'image/jpeg'
            ? await document.embedJpg(item.imageBytes)
            : await document.embedPng(item.imageBytes);
      } catch {
        throw new Error(
          `${item.attachment.name}: This image cannot be read. Use its original separately.`,
        );
      }
      if (image.width * image.height > 32_000_000)
        throw new Error(`${item.attachment.name}: Resize this image before creating the packet.`);
      const available = writer.y - PAGE.bottom - 10;
      const scale = Math.min(
        (PAGE.width - 2 * PAGE.margin) / image.width,
        available / image.height,
      );
      const width = image.width * scale;
      const height = image.height * scale;
      writer.page.drawImage(image, {
        x: (PAGE.width - width) / 2,
        y: writer.y - height,
        width,
        height,
      });
    }
  }
  addContents(writer, entries);
  const pages = document.getPages();
  const generated = new Set(writer.generatedPages);
  for (const [index, page] of pages.entries()) {
    if (!generated.has(page)) continue;
    page.drawLine({
      start: { x: PAGE.margin, y: 45 },
      end: { x: PAGE.width - PAGE.margin, y: 45 },
      thickness: 0.5,
      color: COLORS.line,
    });
    page.drawText(
      t('Prepared by you - not submitted by Anchor', 'Preparado por ti - Anchor no lo ha enviado'),
      { x: PAGE.margin, y: 30, size: 8, font: fonts.regular, color: COLORS.muted },
    );
    const number = `${index + 1} / ${pages.length}`;
    page.drawText(number, {
      x: PAGE.width - PAGE.margin - fonts.regular.widthOfTextAtSize(number, 8),
      y: 30,
      size: 8,
      font: fonts.regular,
      color: COLORS.muted,
    });
  }
  // Only neutral metadata is set; source document metadata and account IDs are
  // never copied into the output. The input bytes and saved files stay intact.
  return document.save({ updateFieldAppearances: false });
}
