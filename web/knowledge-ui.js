import {
  KNOWLEDGE_VERSION,
  KNOWLEDGE_PASSAGES,
  KNOWLEDGE_SOURCES,
  PROGRAM_KNOWLEDGE,
} from './program-assistant.js';
const normalize = (text) =>
  text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
// These transient search preferences remain on the device. Preserve them
// through save-status redraws, without adding free-text queries to an account.
let filters = { query: '', program: 'all', jurisdiction: null };
export function resetKnowledgeLibrary() {
  filters = { query: '', program: 'all', jurisdiction: null };
}
export function renderKnowledgeLibrary({ language, county, escape: e }) {
  const t = (en, es) => (language === 'es' ? es : en);
  const selectedCounty = filters.jurisdiction || county;
  return `<div class="page-head"><div><div class="eyebrow">${t('REVIEWED PUBLIC GUIDANCE', 'GUÍA PÚBLICA REVISADA')}</div><h1>${t('Answers with a source.', 'Respuestas con una fuente.')}</h1><p class="page-sub">${t('Browse Anchor’s summaries and check the official instructions. Search runs on this device.', 'Consulta los resúmenes de Anchor y verifica las instrucciones oficiales. La búsqueda se realiza aquí.')}</p></div></div><section class="panel knowledge-filters"><div class="field"><label for="knowledge-query">${t('Search guidance', 'Buscar orientación')}</label><input id="knowledge-query" type="search" maxlength="200" value="${e(filters.query)}" placeholder="${t('Reporting month, missing proof, renewal…', 'Mes del informe, comprobante faltante, renovación…')}"></div><div class="field"><label for="knowledge-program">${t('Program', 'Programa')}</label><select id="knowledge-program"><option value="all">${t('All programs', 'Todos los programas')}</option>${Object.entries(
    PROGRAM_KNOWLEDGE,
  )
    .map(
      ([id, item]) =>
        `<option value="${e(id)}" ${filters.program === id ? 'selected' : ''}>${e(item.label || item.name || item.title || id)}</option>`,
    )
    .join(
      '',
    )}</select></div><div class="field"><label for="knowledge-county">${t('Jurisdiction', 'Jurisdicción')}</label><select id="knowledge-county"><option value="santa-clara" ${selectedCounty === 'santa-clara' ? 'selected' : ''}>Santa Clara</option><option value="san-mateo" ${selectedCounty === 'san-mateo' ? 'selected' : ''}>San Mateo</option><option value="california" ${selectedCounty === 'california' ? 'selected' : ''}>${t('State & federal guidance', 'Guía estatal y federal')}</option></select></div></section><p class="hint">${t('Library reviewed', 'Biblioteca revisada')}: ${e(KNOWLEDGE_VERSION)} · ${t('Summaries support preparation; the linked agency remains authoritative.', 'Los resúmenes ayudan a preparar; la agencia enlazada sigue siendo la autoridad.')}</p><div id="knowledge-results" class="knowledge-grid" aria-live="polite"></div>`;
}
export function updateKnowledgeResults({ language, county, escape: e }) {
  const root = document.querySelector('#knowledge-results');
  if (!root) return;
  const t = (en, es) => (language === 'es' ? es : en);
  const query = normalize(document.querySelector('#knowledge-query').value)
    .split(/\s+/)
    .filter(Boolean);
  const program = document.querySelector('#knowledge-program').value;
  const jurisdiction = document.querySelector('#knowledge-county').value || county;
  filters = { query: document.querySelector('#knowledge-query').value, program, jurisdiction };
  const sources = new Map(KNOWLEDGE_SOURCES.map((source) => [source.id, source]));
  const items = KNOWLEDGE_PASSAGES.filter((item) => {
    const source = sources.get(item.sourceId);
    return (
      source &&
      (source.jurisdiction === jurisdiction ||
        ['federal', 'california'].includes(source.jurisdiction)) &&
      (program === 'all' || item.program === program) &&
      query.every((term) =>
        normalize(item.title[language] + ' ' + item.text[language]).includes(term),
      )
    );
  });
  root.innerHTML =
    items
      .map((item) => {
        const source = sources.get(item.sourceId);
        return `<article class="panel knowledge-card"><span class="tag gray">${e(item.program)} · ${e(source.jurisdiction)}</span><h2>${e(item.title[language])}</h2><p>${e(item.text[language])}</p><a class="link-button" href="${e(source.url)}" target="_blank" rel="noopener noreferrer">${e(source.title)} ↗</a><p class="hint">${t('Reviewed', 'Revisado')}: ${e(source.reviewedAt)}</p></article>`;
      })
      .join('') ||
    `<p>${t('No matching reviewed guidance. Try fewer words or ask the issuing agency.', 'No hay orientación revisada que coincida. Prueba menos palabras o consulta a la agencia.')}</p>`;
}
