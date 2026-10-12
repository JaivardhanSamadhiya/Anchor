import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeNotice } from '../web/engine.js';
test('Spanish verification preserves spans and separates submission from certification end', () => {
  const text =
    'AVISO FICTICIO\nCalFresh CF 377.6\nCondado de Santa Clara\nFecha del aviso: 9 de octubre de 2026\nPor favor entregue los documentos para el 22 de octubre de 2026.\nSu certificación termina el 31 de octubre de 2026.\nDocumentos solicitados:\n[X] Comprobantes de ingresos de septiembre de 2026\n[ ] Recibos de alquiler\nNo envíe documentos de identidad.\nPor ejemplo, puede entregar documentos el 15 de octubre de 2026.';
  const notice = analyzeNotice(text);
  assert.equal(notice.language, 'es');
  assert.equal(notice.supported, true);
  assert.equal(notice.noticeDate, '2026-10-09');
  assert.deepEqual(
    notice.deadlines.map((item) => [item.kind, item.date]),
    [
      ['submit', '2026-10-22'],
      ['end', '2026-10-31'],
    ],
  );
  assert.equal(notice.requests.filter((item) => item.quote.startsWith('[X]')).length, 1);
  assert.ok(
    !notice.requests.some(
      (item) =>
        item.quote.startsWith('[ ]') ||
        item.quote.startsWith('No envíe') ||
        item.quote.startsWith('Por ejemplo'),
    ),
  );
  for (const fact of [...notice.requests, ...notice.deadlines])
    assert.equal(text.slice(fact.start, fact.end), fact.quote);
  assert.ok(notice.deadlines.every((item) => !item.confirmed));
});
test('Spanish relative dates remain unresolved; invalid dates never become calendar facts', () => {
  const notice = analyzeNotice(
    'CalFresh CF 377.6\nFecha del aviso: 31 de febrero de 2026\nPor favor entregue los comprobantes dentro de 10 días.',
  );
  assert.equal(notice.noticeDate, null);
  assert.equal(notice.deadlines[0].date, null);
  assert.equal(notice.deadlines[0].needsReview, true);
});

test('Spanish guidance translates tasks and warnings while retaining exact original evidence', () => {
  const lines = [
    'AVISO FICTICIO',
    'CalFresh CF 377.6',
    'Condado de Santa Clara',
    'Fecha del aviso: 31 de febrero de 2026',
    'Por favor complete el formulario SAR 7 dentro de 10 días.',
    'Por favor complete su entrevista el 22 de octubre de 2026.',
    '□ Recibos de alquiler',
  ];
  const text = lines.join('\r\n');
  const notice = analyzeNotice(text, { id: 'spanish-source-review', now: '2026-10-12T12:00:00Z' });
  assert.equal(
    notice.sourceText,
    text,
    'translated guidance must not rewrite the source or its line endings',
  );
  assert.equal(notice.language, 'es');
  assert.equal(notice.title, 'Solicitud de información de CalFresh');
  assert.equal(notice.noticeDate, null);
  assert.deepEqual(
    notice.requests.map((item) => [item.kind, item.title]),
    [
      ['form', 'Completa y entrega el formulario solicitado'],
      ['interview', 'Completa la entrevista descrita en este aviso'],
    ],
  );
  assert.ok(
    notice.requests.every(
      (item) =>
        item.description ===
        'Esta acción proviene del texto resaltado del aviso. Verifica el original antes de completarla.',
    ),
  );
  assert.deepEqual(notice.warnings, [
    'Verifica la fecha del aviso, el año y el orden de la fecha en el original.',
    'El plazo relativo necesita revisión del usuario o la agencia. Anchor no calculó una fecha.',
    'El texto contiene una casilla o marca poco clara. Compara el original antes de considerar una opción seleccionada.',
  ]);
  assert.deepEqual(
    notice.deadlines.map((item) => [item.label, item.date, item.confirmed]),
    [
      ['Plazo relativo — verifica la fecha exacta', null, false],
      ['Fecha de entrevista', '2026-10-22', false],
    ],
  );
  for (const fact of [...notice.requests, ...notice.deadlines]) {
    assert.equal(text.slice(fact.start, fact.end), fact.quote);
    assert.equal(fact.quote, lines[fact.line - 1]);
  }
  assert.equal(
    notice.requests.some((item) => item.quote === lines.at(-1)),
    false,
    'translated warning copy cannot convert an unclear square into a selected requirement',
  );
});
