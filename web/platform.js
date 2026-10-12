// Browser reading and local storage. account.js separately syncs signed-in files.
// Dynamic imports keep the OCR/PDF engines out of the initial application load.
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_PAGES = 10;
const MAX_TEXT_CHARS = 500_000;
const MAX_RENDER_PIXELS = 12_000_000;

/** Source coordinates are optional, reproducible metadata, not the notice
 * text. Bound them across the whole file so a dense PDF cannot crowd out the
 * account's workspace capacity. Omitted areas receive no approximate match. */
export function compactSourceLayout(layout) {
  let remainingWords = 1200,
    remainingBytes = 120000;
  let truncated = false;
  const pages = layout.slice(0, 10).map((page) => ({
    ...page,
    words: page.words.flatMap((box) => {
      if (!remainingWords || box.text.length > 400) {
        truncated = true;
        return [];
      }
      const word = {
        text: box.text,
        ...Object.fromEntries(
          ['x', 'y', 'w', 'h'].map((key) => [key, Math.round(box[key] * 10000) / 10000]),
        ),
      };
      const size = new TextEncoder().encode(JSON.stringify(word)).length;
      if (size > remainingBytes) {
        truncated = true;
        return [];
      }
      remainingWords--;
      remainingBytes -= size;
      return [word];
    }),
  }));
  return { layout: pages, layoutTruncated: truncated };
}
const GUEST_DB_NAME = 'anchor-private-v1';
const DB_VERSION = 1;
let storageScope = 'guest';
const databases = new Map();

/** Every operation captures its scope before awaiting IndexedDB. Account IDs must
 * be opaque server IDs, never a resident's email address. Existing guest data stays
 * in the original database and is never moved during sign-in. */
export function setStorageScope(accountId = 'guest') {
  if (typeof accountId !== 'string' || !accountId || accountId.length > 200)
    throw new Error('Invalid storage account.');
  storageScope = accountId;
  return storageScope;
}

export function getStorageScope() {
  return storageScope;
}

function databaseName(scope) {
  return scope === 'guest' ? GUEST_DB_NAME : `anchor-account-v1:${encodeURIComponent(scope)}`;
}

const vendorURL = (path) => new URL(`./vendor/${path}`, import.meta.url).href;

export function escapeHTML(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char],
  );
}

function plain(value, limit = 20_000) {
  if (value == null) return '';
  // Strip invisible controls; preserve newlines/tabs in document text.
  return String(value)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, '')
    .slice(0, limit);
}

function validateFile(file) {
  if (!file || typeof file.size !== 'number' || typeof file.arrayBuffer !== 'function') {
    throw new Error('Choose a file from your device.');
  }
  if (file.size === 0)
    throw new Error('This file is empty. Choose a notice with readable content.');
  if (!Number.isFinite(file.size) || file.size < 0 || file.size > MAX_FILE_BYTES) {
    throw new Error('This file is larger than 20 MB. Use a smaller file or split the PDF first.');
  }
  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();
  if (name.endsWith('.pdf') || type === 'application/pdf') return 'pdf';
  if (/\.(txt|text)$/i.test(name) || type === 'text/plain') return 'text';
  if (/\.(png|jpe?g|webp|bmp)$/i.test(name) || /^image\/(png|jpeg|webp|bmp)$/.test(type))
    return 'image';
  throw new Error(
    'Choose a PDF, plain-text file, PNG, JPEG, WebP, or BMP image. For a phone HEIC photo, export it as JPEG first.',
  );
}

function reporter(callback) {
  let last = 0;
  return (stage, progress, message) => {
    last = Math.max(last, Math.min(1, Number(progress) || 0));
    if (typeof callback === 'function') {
      // A presentation callback must not interrupt a document operation.
      try {
        callback({ stage, progress: last, message });
      } catch {
        /* caller controls its UI */
      }
    }
  };
}

async function withDeadline(promise, milliseconds, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function loadPDFLibrary() {
  try {
    const library = await import('./vendor/pdfjs.mjs');
    library.GlobalWorkerOptions.workerSrc = vendorURL('pdf.worker.mjs');
    return library;
  } catch {
    throw new Error(
      'The local PDF reader is unavailable. Reconnect to this app once to cache its files, or paste the notice text instead.',
    );
  }
}

async function createOCRWorker(report, page, pages, language = 'en') {
  let library;
  try {
    library = await import('./vendor/tesseract.mjs');
  } catch {
    throw new Error(
      'The local image reader is unavailable. Reconnect to this app once to load its OCR files, or paste the notice text instead.',
    );
  }
  const languages = language === 'es' ? 'eng+spa' : 'eng';
  report(
    'ocr-loading',
    0.08,
    language === 'es'
      ? 'Cargando el lector local de español e inglés…'
      : 'Loading the English OCR engine on this device…',
  );
  let accepted = false;
  const pending = library.createWorker(languages, 1, {
    workerPath: vendorURL('tesseract-worker.min.js'),
    corePath: vendorURL('core'),
    langPath: vendorURL('lang'),
    cachePath: `anchor-ocr-${languages}-v1`,
    cacheMethod: 'write',
    workerBlobURL: false,
    gzip: true,
    logger: (message) => {
      const fraction = Number(message.progress) || 0;
      if (message.status === 'recognizing text') {
        report(
          'ocr',
          0.15 + ((page.current - 1 + fraction) / pages) * 0.8,
          `Reading image ${page.current} of ${pages} locally (${Math.round(fraction * 100)}%)…`,
        );
      } else {
        report('ocr-loading', 0.08, 'Preparing local English OCR…');
      }
    },
    // Prevent library worker errors from escaping as uncaught exceptions.
    errorHandler: () => {},
  });
  try {
    const worker = await withDeadline(
      pending,
      60_000,
      'The local OCR engine did not start within a minute. Reconnect to load its English language files, then try again or paste the text.',
    );
    await worker.setParameters({
      preserve_interword_spaces: '1',
      user_defined_dpi: '150',
      tessedit_pageseg_mode: library.PSM.AUTO,
    });
    accepted = true;
    return worker;
  } catch (error) {
    // If initialization resolves after a timeout, still release that worker.
    pending
      .then((worker) => {
        if (!accepted) return worker.terminate();
      })
      .catch(() => {});
    throw new Error(
      error?.message?.startsWith('The local OCR')
        ? error.message
        : 'OCR could not load its local engine or English language files. Reconnect to this app, then try again or paste the notice text.',
    );
  }
}

async function recognize(worker, input) {
  try {
    const result = await withDeadline(
      worker.recognize(input, {}, { text: true, blocks: true }),
      120_000,
      'Reading this image took too long. Crop to one clearly readable page, use a sharper photo, or paste the notice text.',
    );
    const text = String(result?.data?.text || '');
    if (text.length > MAX_TEXT_CHARS)
      throw new Error(
        'The image contains too much text. Crop to the relevant notice page or paste its text.',
      );
    const words = [];
    for (const block of result?.data?.blocks || [])
      for (const paragraph of block.paragraphs || [])
        for (const line of paragraph.lines || [])
          for (const word of line.words || []) {
            if (words.length < 2000 && word.bbox && word.text)
              words.push({ text: plain(word.text, 300), ...word.bbox });
          }
    return {
      text: plain(text, MAX_TEXT_CHARS).trim(),
      words,
      confidence: Number(result?.data?.confidence) || 0,
    };
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(
      'The local OCR engine could not read this image. Use a sharper PNG or JPEG photo, or paste the notice text.',
    );
  }
}

function pdfText(items) {
  const lines = [];
  let line = '';
  let lastY;
  for (const item of items || []) {
    if (typeof item.str !== 'string') continue;
    const y = item.transform?.[5];
    if (line && Number.isFinite(y) && Number.isFinite(lastY) && Math.abs(y - lastY) > 3) {
      lines.push(line.trim());
      line = '';
    }
    line += `${line && !/\s$/.test(line) ? ' ' : ''}${item.str}`;
    lastY = y;
    if (item.hasEOL) {
      lines.push(line.trim());
      line = '';
      lastY = undefined;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return plain(lines.join('\n'), MAX_TEXT_CHARS).trim();
}

async function extractPDF(file, report, options) {
  const library = await loadPDFLibrary();
  report('pdf-loading', 0.05, 'Opening the PDF on this device…');
  let loadingTask;
  let document;
  let worker;
  const currentPage = { current: 1 };
  try {
    loadingTask = library.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      isEvalSupported: false,
      cMapUrl: vendorURL('cmaps/'),
      cMapPacked: true,
      standardFontDataUrl: vendorURL('standard_fonts/'),
      useSystemFonts: true,
    });
    // Reject encrypted files; never ask the resident to share a document password.
    loadingTask.onPassword = (_updatePassword, reason) => {
      const error = new Error(
        reason === library.PasswordResponses?.INCORRECT_PASSWORD
          ? 'The PDF password was not accepted. Use an unlocked copy or paste the notice text.'
          : 'This PDF is password-protected. Use an unlocked copy from your device or paste the notice text.',
      );
      loadingTask.destroy().catch(() => {});
      passwordReject(error);
    };
    let passwordReject;
    const passwordError = new Promise((_, reject) => {
      passwordReject = reject;
    });
    document = await withDeadline(
      Promise.race([loadingTask.promise, passwordError]),
      30_000,
      'This PDF could not be opened in time. Try a smaller PDF, a page image, or pasted text.',
    );
    if (document.numPages > MAX_PDF_PAGES) {
      throw new Error(
        `This PDF has ${document.numPages} pages. Anchor reads at most 10 pages at a time. Split it into smaller files first; no pages were silently omitted.`,
      );
    }
    const texts = [];
    const layout = [];
    const scanQuality = [];
    let usedOCR = false;
    for (let number = 1; number <= document.numPages; number += 1) {
      currentPage.current = number;
      report(
        'pdf-text',
        0.1 + ((number - 1) / document.numPages) * 0.8,
        `Reading PDF page ${number} of ${document.numPages}…`,
      );
      const page = await document.getPage(number);
      const content = (await page.getTextContent()).items;
      let text = pdfText(content);
      const natural = page.getViewport({ scale: 1 });
      let wordBoxes = content
        .filter((item) => typeof item.str === 'string' && item.str.trim())
        .slice(0, 2000)
        .map((item) => {
          const x = item.transform[4],
            y = item.transform[5];
          const rect = natural.convertToViewportRectangle([
            x,
            y,
            x + item.width,
            y + (item.height || 10),
          ]);
          return {
            text: item.str,
            x: Math.min(rect[0], rect[2]) / natural.width,
            y: Math.min(rect[1], rect[3]) / natural.height,
            w: Math.abs(rect[2] - rect[0]) / natural.width,
            h: Math.abs(rect[3] - rect[1]) / natural.height,
          };
        });
      // Scans sometimes have only a selectable header. Check sparse pages for
      // embedded images so that header text does not conceal the scanned body.
      const characterCount = text.replace(/\s/g, '').length;
      let scannedBody = false;
      if (characterCount >= 40 && characterCount < 200) {
        const operators = await page.getOperatorList();
        const imageOperators = [
          library.OPS.paintImageXObject,
          library.OPS.paintInlineImageXObject,
          library.OPS.paintImageMaskXObject,
        ];
        scannedBody = operators.fnArray.some((operator) => imageOperators.includes(operator));
      }
      if (characterCount < 40 || scannedBody) {
        usedOCR = true;
        if (!worker)
          worker = await createOCRWorker(report, currentPage, document.numPages, options.language);
        const original = page.getViewport({ scale: 1 });
        const scale = Math.min(
          2.1,
          Math.sqrt(MAX_RENDER_PIXELS / (original.width * original.height)),
          8000 / original.width,
          8000 / original.height,
        );
        if (!Number.isFinite(scale) || scale <= 0)
          throw new Error('This PDF has an invalid page size. Use a page image or pasted text.');
        const viewport = page.getViewport({ scale });
        const canvas = globalThis.document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context)
          throw new Error('The browser could not render this PDF page. Paste its text instead.');
        try {
          await page.render({ canvasContext: context, viewport, background: 'rgb(255,255,255)' })
            .promise;
          const recognized = await recognize(worker, canvas);
          if (recognized.text) text = recognized.text;
          wordBoxes = recognized.words.map((word) => ({
            text: word.text,
            x: word.x0 / canvas.width,
            y: word.y0 / canvas.height,
            w: (word.x1 - word.x0) / canvas.width,
            h: (word.y1 - word.y0) / canvas.height,
          }));
          scanQuality.push({
            page: number,
            confidence: recognized.confidence,
            needsReview: recognized.confidence < 80,
          });
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
      }
      texts.push(text);
      layout.push({ page: number, width: natural.width, height: natural.height, words: wordBoxes });
      page.cleanup();
      if (texts.reduce((count, value) => count + value.length, 0) > MAX_TEXT_CHARS) {
        throw new Error(
          'This PDF contains too much text for one notice. Split it into smaller files or paste the relevant notice pages.',
        );
      }
    }
    if (!texts.some((text) => text.trim()))
      throw new Error('No readable text was found. Use a clearer scan or paste the notice text.');
    report(
      'complete',
      1,
      usedOCR
        ? 'PDF read locally. Check OCR text carefully before confirming.'
        : 'PDF text read locally. Confirm the extracted details.',
    );
    return {
      text: texts.join('\n\n'),
      kind: 'pdf',
      pages: document.numPages,
      ocr: usedOCR,
      ...(options.includeLayout ? { ...compactSourceLayout(layout), scanQuality } : {}),
    };
  } catch (error) {
    const message = String(error?.message || error);
    if (error?.name === 'PasswordException')
      throw new Error(
        'This PDF is password-protected. Use an unlocked copy or paste the notice text.',
      );
    if (error?.name === 'InvalidPDFException' || /Invalid PDF|PDF header/i.test(message)) {
      throw new Error(
        'This PDF appears damaged or is not a valid PDF. Download it again, upload a page image, or paste the notice text.',
      );
    }
    throw error instanceof Error ? error : new Error(message);
  } finally {
    if (worker) await worker.terminate().catch(() => {});
    if (document) await document.destroy().catch(() => {});
    else if (loadingTask) await loadingTask.destroy().catch(() => {});
  }
}

async function validateImage(file) {
  // Check decoded dimensions before the OCR library allocates its larger buffers.
  let bitmap;
  let url;
  try {
    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(file);
    } else {
      url = URL.createObjectURL(file);
      bitmap = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('The image could not be decoded.'));
        image.src = url;
      });
    }
    const width = bitmap.width || bitmap.naturalWidth;
    const height = bitmap.height || bitmap.naturalHeight;
    if (!width || !height) throw new Error('The image has no readable dimensions.');
    if (width * height > 32_000_000 || width > 12_000 || height > 12_000) {
      throw new Error(
        'This image is too large to read safely on this device. Resize it below 32 megapixels or crop to one notice page.',
      );
    }
  } catch (error) {
    if (/too large/.test(error?.message || '')) throw error;
    throw new Error(
      'The image could not be opened. Use a PNG or JPEG photo of one clearly readable notice page.',
    );
  } finally {
    bitmap?.close?.();
    if (url) URL.revokeObjectURL(url);
  }
}

/** OCR language is explicit; document layout is opt-in for older callers. */
export async function extractFile(file, onProgress, options = {}) {
  const kind = validateFile(file);
  const report = reporter(onProgress);
  report('starting', 0, 'Reading your file locally…');
  if (kind === 'text') {
    const text =
      typeof file.text === 'function'
        ? await file.text()
        : new TextDecoder().decode(await file.arrayBuffer());
    if (text.length > MAX_TEXT_CHARS)
      throw new Error(
        'This text file is too long. Paste the relevant notice text or split it into smaller files.',
      );
    const cleaned = plain(text, MAX_TEXT_CHARS).trim();
    if (!cleaned) throw new Error('No readable text was found in this file.');
    report('complete', 1, 'Text read locally. Confirm the extracted details.');
    return { text: cleaned, kind: 'text', pages: 1, ocr: false };
  }
  if (kind === 'pdf') return extractPDF(file, report, options);
  await validateImage(file);
  let worker;
  try {
    worker = await createOCRWorker(report, { current: 1 }, 1, options.language);
    const recognized = await recognize(worker, file);
    const text = recognized.text;
    if (!text)
      throw new Error(
        'No readable text was found. Try a sharper, upright photo or paste the notice text.',
      );
    report('complete', 1, 'Image read locally. Check OCR text carefully before confirming.');
    let layout = [];
    if (options.includeLayout) {
      const bitmap = await createImageBitmap(file);
      layout = [
        {
          page: 1,
          width: bitmap.width,
          height: bitmap.height,
          words: recognized.words.map((word) => ({
            text: word.text,
            x: word.x0 / bitmap.width,
            y: word.y0 / bitmap.height,
            w: (word.x1 - word.x0) / bitmap.width,
            h: (word.y1 - word.y0) / bitmap.height,
          })),
        },
      ];
      bitmap.close();
    }
    return {
      text,
      kind: 'image',
      pages: 1,
      ocr: true,
      ...(options.includeLayout
        ? {
            ...compactSourceLayout(layout),
            scanQuality: [
              {
                page: 1,
                confidence: recognized.confidence,
                needsReview: recognized.confidence < 80,
              },
            ],
          }
        : {}),
    };
  } finally {
    if (worker) await worker.terminate().catch(() => {});
  }
}

function storageError(error) {
  if (error?.name === 'QuotaExceededError')
    return new Error(
      'This browser has run out of local storage. Export a backup and remove older attachments, then try again.',
    );
  return new Error(
    'Local browser storage is unavailable. Allow site storage or use a regular browser window. Export your work before leaving this page.',
  );
}

function openDatabase(scope = storageScope) {
  if (!globalThis.indexedDB) return Promise.reject(storageError());
  const name = databaseName(scope);
  if (!databases.has(name)) {
    const pending = new Promise((resolve, reject) => {
      const request = indexedDB.open(name, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('state')) db.createObjectStore('state');
        if (!db.objectStoreNames.contains('attachments'))
          db.createObjectStore('attachments', { keyPath: 'id' });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          databases.delete(name);
        };
        resolve(db);
      };
      request.onerror = () => {
        databases.delete(name);
        reject(storageError(request.error));
      };
      request.onblocked = () => {
        databases.delete(name);
        reject(
          new Error(
            'Another Anchor tab is blocking a storage update. Close the other tab and try again.',
          ),
        );
      };
    });
    databases.set(name, pending);
  }
  return databases.get(name);
}

async function transact(stores, mode, operation, scope = storageScope) {
  const db = await openDatabase(scope);
  return new Promise((resolve, reject) => {
    let transaction;
    let result;
    try {
      transaction = db.transaction(stores, mode);
      const request = operation(transaction);
      if (request)
        request.onsuccess = () => {
          result = request.result;
        };
    } catch (error) {
      reject(storageError(error));
      return;
    }
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = transaction.onerror = () => reject(storageError(transaction.error));
  });
}

export async function saveState(value, scope = storageScope) {
  return transact(
    ['state'],
    'readwrite',
    (transaction) => transaction.objectStore('state').put(value, 'current'),
    scope,
  );
}

export async function loadState(scope = storageScope) {
  const value = await transact(
    ['state'],
    'readonly',
    (transaction) => transaction.objectStore('state').get('current'),
    scope,
  );
  return value ?? null;
}

export async function saveSyncMetadata(value, scope = storageScope) {
  return transact(
    ['state'],
    'readwrite',
    (transaction) => transaction.objectStore('state').put(value, 'sync'),
    scope,
  );
}

export async function loadSyncMetadata(scope = storageScope) {
  return (
    (await transact(
      ['state'],
      'readonly',
      (transaction) => transaction.objectStore('state').get('sync'),
      scope,
    )) ?? null
  );
}

/** Clear all resident state and receipt blobs together. OCR language/cache assets are not resident records. */
export async function clearState(scope = storageScope) {
  return transact(
    ['state', 'attachments'],
    'readwrite',
    (transaction) => {
      transaction.objectStore('state').clear();
      transaction.objectStore('attachments').clear();
    },
    scope,
  );
}

export async function saveAttachment(file, requestedId, scope = storageScope) {
  validateFile(file);
  const id =
    requestedId ||
    globalThis.crypto?.randomUUID?.() ||
    `receipt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(id))
    throw new Error('Invalid attachment ID.');
  const blob = file.slice(0, file.size, file.type || 'application/octet-stream');
  const record = {
    id,
    name: plain(file.name || 'receipt', 200),
    type: plain(file.type || 'application/octet-stream', 100),
    blob,
  };
  await transact(
    ['attachments'],
    'readwrite',
    (transaction) => transaction.objectStore('attachments').put(record),
    scope,
  );
  return id;
}

/** Save a cloud response locally without invoking the PDF/OCR readers. */
export async function storeAttachment(record, scope = storageScope) {
  if (
    !record?.blob ||
    record.blob.size > MAX_FILE_BYTES ||
    !/^[a-zA-Z0-9_-]{1,200}$/.test(String(record.id))
  )
    throw new Error('Invalid attachment.');
  return transact(
    ['attachments'],
    'readwrite',
    (transaction) =>
      transaction.objectStore('attachments').put({
        id: record.id,
        name: plain(record.name || 'attachment', 200),
        type: plain(record.type || record.blob.type || 'application/octet-stream', 100),
        blob: record.blob,
      }),
    scope,
  );
}

export async function getAttachment(id, scope = storageScope) {
  const record = await transact(
    ['attachments'],
    'readonly',
    (transaction) => transaction.objectStore('attachments').get(String(id)),
    scope,
  );
  return record
    ? {
        id: record.id,
        name: record.name,
        type: record.type,
        size: record.blob.size,
        blob: record.blob,
      }
    : null;
}

/** Includes blobs for explicit migration/export only; callers never sync samples. */
export async function listAttachments(scope = storageScope) {
  return (
    (await transact(
      ['attachments'],
      'readonly',
      (transaction) => transaction.objectStore('attachments').getAll(),
      scope,
    )) || []
  );
}

export async function deleteAttachment(id, scope = storageScope) {
  return transact(
    ['attachments'],
    'readwrite',
    (transaction) => transaction.objectStore('attachments').delete(String(id)),
    scope,
  );
}

export function downloadFile(name, content, mime = 'text/plain;charset=utf-8') {
  const safeName = plain(name || 'anchor-export.txt', 180).replace(/[\/:*?"<>|]/g, '-');
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeName;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Plain text only. Insert the result with textContent, never innerHTML. */
export function buildHandoff(notices = [], events = [], county = '', lang = 'en') {
  const spanish = lang === 'es';
  const words = spanish
    ? {
        title: 'ANCHOR · Resumen para una persona de apoyo',
        county: 'Condado',
        generated: 'Creado',
        warning:
          'Información registrada por el residente. Anchor no confirma elegibilidad, recepción, aprobación ni plazos legales. Revise los avisos originales con la oficina del condado.',
        notices: 'AVISOS',
        events: 'HISTORIAL Y COMPROBANTES',
        none: 'No hay registros.',
        program: 'Programa',
        kind: 'Tipo',
        status: 'Estado registrado',
        date: 'Fecha del aviso',
        due: 'Fecha límite confirmada por el residente',
        action: 'Acción solicitada',
        preparation: 'Preparación registrada',
        prepared: 'Preparado por el residente',
        unprepared: 'No marcado como preparado',
        evidence: 'Fragmento del texto original',
        notes: 'Notas',
        receipt: 'Archivo del comprobante',
        dates: 'Fechas del aviso',
        confirmed: 'Confirmada por el residente',
        review: 'Sin confirmar: necesita revisión',
        excluded: 'Marcada por el residente como no aplicable; excluida del calendario',
        corrected: 'Fecha corregida manualmente por el residente; se conserva la cita original',
        clarification: 'Aclaración registrada por el residente',
        warningLabel: 'Revisar',
        dateUnknown: 'Sin fecha exacta',
        source: 'Fuente',
        truncated: '[Texto abreviado; consulte el aviso completo.]',
        privacy:
          'Este resumen puede contener información privada. Compártalo solo con quien usted elija.',
      }
    : {
        title: 'ANCHOR · Navigator handoff',
        county: 'County',
        generated: 'Generated',
        warning:
          'Resident-recorded information. Anchor does not verify eligibility, receipt, approval, or legal deadlines. Review original notices with the county office.',
        notices: 'NOTICES',
        events: 'ACTIVITY AND RECEIPTS',
        none: 'No records.',
        program: 'Program',
        kind: 'Type',
        status: 'Recorded status',
        date: 'Notice date',
        due: 'Resident-confirmed due date',
        action: 'Requested action',
        preparation: 'Recorded preparation',
        prepared: 'Prepared by resident',
        unprepared: 'Not marked prepared',
        evidence: 'Original text excerpt',
        notes: 'Notes',
        receipt: 'Receipt filename',
        dates: 'Dates in the notice',
        confirmed: 'Resident confirmed',
        review: 'Unconfirmed: needs review',
        excluded: 'Resident marked this date as not applicable; excluded from calendar',
        corrected: 'Date manually corrected by resident; original quote preserved',
        clarification: 'Resident-recorded clarification',
        warningLabel: 'Review',
        dateUnknown: 'No exact date',
        source: 'Source',
        truncated: '[Text shortened; consult the complete original notice.]',
        privacy:
          'This handoff may contain private information. Share it only with someone you choose.',
      };
  const countyName =
    typeof county === 'object' ? county?.name || county?.label || county?.id || '' : county;
  const lines = [
    words.title,
    `${words.county}: ${plain(countyName, 200) || '—'}`,
    `${words.generated}: ${new Date().toISOString()}`,
    '',
    words.warning,
    '',
    words.notices,
  ];
  if (!Array.isArray(notices) || notices.length === 0) lines.push(words.none);
  else
    notices.slice(0, 200).forEach((notice, index) => {
      const fields = notice?.confirmed || notice?.fields || notice?.analysis || notice || {};
      lines.push(
        '',
        `${index + 1}. ${plain(notice?.title || notice?.filename || notice?.name || 'Notice', 500)}`,
      );
      const add = (label, value) => {
        if (value != null && value !== '') lines.push(`${label}: ${plain(value, 4000)}`);
      };
      add(words.program, fields.program || notice?.program);
      add(words.kind, fields.type || fields.kind || notice?.kind);
      add(words.status, notice?.status);
      add(words.date, fields.noticeDate || fields.date || notice?.noticeDate);
      // Never label an automatically extracted date as confirmed unless explicitly marked.
      const confirmedDue =
        notice?.confirmedDeadline ||
        fields.confirmedDeadline ||
        (notice?.confirmed === true || notice?.confirmed?.dueDate || notice?.verified === true
          ? fields.dueDate || fields.deadline || notice?.deadline
          : '');
      add(words.due, confirmedDue);
      const deadlines = fields.deadlines || notice?.deadlines;
      if (Array.isArray(deadlines) && deadlines.length) {
        lines.push(`${words.dates}:`);
        for (const deadline of deadlines.slice(0, 30)) {
          lines.push(
            `  ${plain(deadline?.label || deadline?.kind || '', 200)}: ${plain(deadline?.date || deadline?.raw || words.dateUnknown, 200)} — ${deadline?.excluded === true ? words.excluded : deadline?.confirmed === true ? words.confirmed : words.review}`,
          );
          if (deadline?.userEntered === true) lines.push(`  ${words.corrected}`);
          if (deadline?.quote) lines.push(`  ${words.source}: ${plain(deadline.quote, 2000)}`);
        }
      }
      const actions =
        fields.requests ||
        notice?.requests ||
        fields.actions ||
        fields.requestedActions ||
        notice?.actions;
      if (Array.isArray(actions))
        for (const action of actions.slice(0, 30)) {
          add(
            words.action,
            typeof action === 'string'
              ? action
              : action.text || action.label || action.title || action.quote,
          );
          if (typeof action === 'object' && action?.quote) add(words.source, action.quote);
          // Preparation is a resident checklist entry, never proof of submission or acceptance.
          if (action?.status === 'done' || action?.status === 'todo')
            add(words.preparation, action.status === 'done' ? words.prepared : words.unprepared);
        }
      else add(words.action, fields.action || notice?.action);
      const warnings = fields.warnings || notice?.warnings;
      if (Array.isArray(warnings))
        for (const warning of warnings.slice(0, 20)) add(words.warningLabel, warning);
      add(words.notes, notice?.notes);
      add(words.clarification, notice?.clarification);
      const original = notice?.text || notice?.rawText || notice?.sourceText;
      if (original) {
        add(words.evidence, original);
        if (String(original).length > 4000) lines.push(words.truncated);
      }
    });
  lines.push('', words.events);
  if (!Array.isArray(events) || events.length === 0) lines.push(words.none);
  else
    events.slice(0, 500).forEach((event) => {
      lines.push(
        '',
        `${plain(event?.date || event?.createdAt || event?.timestamp || '', 100)} · ${plain(event?.title || event?.type || event?.kind || 'Activity', 300)}`,
      );
      if (event?.noticeId) lines.push(`Notice ID: ${plain(event.noticeId, 200)}`);
      if (event?.detail || event?.notes || event?.note || event?.description)
        lines.push(
          `${words.notes}: ${plain(event.detail || event.notes || event.note || event.description, 4000)}`,
        );
      const attachment =
        event?.filename || event?.attachmentName || event?.receiptName || event?.attachment?.name;
      if (attachment) lines.push(`${words.receipt}: ${plain(attachment, 200)}`);
    });
  lines.push('', words.privacy);
  return lines.join('\n');
}

/** Receipts are stored separately; this JSON export contains records, not attachment binaries. */
export function buildBackup(state) {
  return JSON.stringify(
    {
      metadata: {
        application: 'Anchor',
        format: 'anchor-records-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        attachmentsIncluded: false,
        note: 'Receipt file contents are not included. Save receipt attachments separately. This export may contain private notice text.',
      },
      state,
    },
    null,
    2,
  );
}
