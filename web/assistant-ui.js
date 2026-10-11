/** Public-program chat. Free text stays in memory; only reviewed topic enums
 * cross the cloud boundary. The response label distinguishes Gemini from the
 * offline, source-backed fallback. Nothing here changes a resident's case. */
import {
  PROGRAM_IDS,
  PROGRAM_KNOWLEDGE,
  classifyPublicQuestion,
  sourceGuidance,
} from './program-assistant.js';

export function createProgramAssistant({
  getAccount,
  getLanguage,
  ask,
  redraw,
  navigate,
  escapeHTML: e,
}) {
  let draft = '',
    program = 'calfresh',
    adultConfirmed = false,
    waiting = false;
  let messages = [],
    generation = 0,
    controller;
  const t = (en, es) => (getLanguage() === 'es' ? es : en);
  const examples = [
    'How do I renew CalFresh?',
    'What if I am missing income proof?',
    'How does SSI differ from SSDI?',
    'Where can I fill out a form?',
  ];

  function capture(root = document) {
    const input = root.querySelector('#assistant-question');
    if (input) draft = input.value;
    const programInput = root.querySelector('#assistant-program');
    if (programInput) program = programInput.value;
    const adult = root.querySelector('#assistant-adult');
    if (adult) adultConfirmed = adult.checked;
  }
  function reset() {
    generation++;
    controller?.abort();
    draft = '';
    messages = [];
    adultConfirmed = false;
    waiting = false;
    // Clear the still-mounted composer before a workspace/account render can
    // capture it. Private, unfinished text must not cross account boundaries.
    const input = document.querySelector('#assistant-question');
    if (input) input.value = '';
    const adult = document.querySelector('#assistant-adult');
    if (adult) adult.checked = false;
  }
  function view() {
    const info = getAccount();
    return `<div class="page-head"><div><div class="eyebrow">${t('A LITTLE HELP, RIGHT HERE', 'AYUDA AQUÍ MISMO')}</div><h1>${t('Ask Anchor.', 'Pregunta a Anchor.')}</h1><p class="page-sub">${t('Understand a program. Find your next step. Keep the agency’s guidance close.', 'Entiende un programa y encuentra el siguiente paso con fuentes oficiales.')}</p></div></div>
      <div class="assistant-layout"><section class="panel assistant-chat" aria-label="${t('Program assistant', 'Asistente de programas')}">
      <div class="assistant-intro"><span class="tag green">${t('Official sources', 'Fuentes oficiales')}</span><p>${t('Ask general questions about benefits or how to use Anchor. Leave names, case numbers, medical details, and personal finances in your private workspace.', 'Pregunta sobre beneficios o cómo usar Anchor. Conserva nombres, números de caso, datos médicos y finanzas personales en tu espacio privado.')}</p></div>
      <div class="assistant-messages" role="log" aria-live="polite">${messages.map((item) => `<article class="assistant-message"><p class="assistant-question">${e(item.question)}</p><div class="assistant-topic"><strong>${t('Public topic', 'Tema público')}</strong> ${e(item.preview)}</div>${item.response ? `<span class="tag ${item.response.mode === 'gemini' ? 'green' : 'gray'}">${item.response.mode === 'gemini' ? 'Gemini AI' : t('Source guide', 'Guía de fuentes')}</span><div class="assistant-answer">${e(item.response.answer)}</div>${item.response.message ? `<p class="hint">${e(item.response.message)}</p>` : ''}<div class="assistant-sources">${item.response.citations.map((c) => `<a href="${e(c.url)}" target="_blank" rel="noopener noreferrer">${e(c.title)} ↗</a>`).join('')}</div>${item.response.navigation ? `<button class="button light small" data-action="assistant-nav" data-page="${e(item.response.navigation.page)}">${e(item.response.navigation.label)} →</button>` : ''}` : `<p class="hint">${e(item.error || t('Preparing an explanation…', 'Preparando una explicación…'))}</p>`}</article>`).join('')}</div>
      <form id="assistant-form" class="assistant-composer"><label for="assistant-program">${t('Program', 'Programa')}</label><select id="assistant-program">${PROGRAM_IDS.filter(
        (id) => id !== 'navigation',
      )
        .map(
          (id) =>
            `<option value="${id}" ${program === id ? 'selected' : ''}>${e(PROGRAM_KNOWLEDGE[id].label)}</option>`,
        )
        .join(
          '',
        )}</select><label for="assistant-question">${t('Your question', 'Tu pregunta')}</label><textarea id="assistant-question" maxlength="600" rows="3" required placeholder="${t('What should someone do if proof is missing?', '¿Qué hacer si falta un comprobante?')}">${e(draft)}</textarea>
      <label class="assistant-consent"><input id="assistant-adult" type="checkbox" ${adultConfirmed ? 'checked' : ''}><span>${t('I am 18 or older and want Gemini explanations of public topics. Only the public topic is sent to Google; my typed question and notice contents stay out of the request.', 'Tengo 18 años o más y quiero explicaciones de Gemini sobre temas públicos. Solo se envía el tema público a Google, no mi pregunta escrita ni los avisos.')}</span></label>
      <p class="hint">${adultConfirmed && !info.authenticated ? t('Sign in to use Gemini. Official source guidance is available now.', 'Inicia sesión para usar Gemini. La guía oficial está disponible ahora.') : t('Your conversation is temporary. Program decisions and exact requirements come from the agency.', 'La conversación es temporal. La agencia decide los requisitos de tu caso.')}</p><button class="button" type="submit" ${waiting ? 'disabled' : ''}>${waiting ? t('Thinking…', 'Pensando…') : t('Ask Anchor', 'Preguntar a Anchor')}</button></form></section>
      <aside class="panel assistant-side"><h2>${t('Start with a question', 'Empieza con una pregunta')}</h2>${examples.map((q) => `<button class="assistant-example" data-action="assistant-example" data-question="${e(q)}">${e(q)} →</button>`).join('')}<h3>${t('What powers the answer?', '¿Qué genera la respuesta?')}</h3><p>${t('Gemini explains a selected public topic using our reviewed agency source pack. Source guide answers work without AI or sign-in. Every answer shows its source and mode.', 'Gemini explica un tema público con fuentes oficiales revisadas. La guía funciona sin IA ni inicio de sesión. Cada respuesta identifica su fuente y modo.')}</p><p>${t('Notice reading and form preparation happen on your device. The chatbot cannot submit a form, determine eligibility, or change your records.', 'La lectura de avisos y preparación de formularios ocurre en tu dispositivo. El chat no envía formularios ni decide elegibilidad.')}</p></aside></div>`;
  }
  async function submit(form) {
    if (waiting) return;
    capture();
    program = form.querySelector('#assistant-program').value;
    adultConfirmed = form.querySelector('#assistant-adult').checked;
    const local = classifyPublicQuestion(draft, program, getLanguage());
    if (!local.request) {
      messages.push({ question: draft, preview: '', error: local.message });
      messages = messages.slice(-12);
      draft = '';
      redraw();
      return;
    }
    const request = { ...local.request, adultConfirmed: true };
    const item = { question: draft, preview: local.preview, response: null };
    messages.push(item);
    messages = messages.slice(-12);
    draft = '';
    const epoch = generation;
    if (!adultConfirmed || !getAccount().authenticated || !navigator.onLine) {
      item.response = sourceGuidance(
        request,
        t(
          'This is official source guidance, without a Gemini request.',
          'Orientación de fuentes oficiales, sin solicitud a Gemini.',
        ),
      );
      redraw();
      return;
    }
    waiting = true;
    controller = new AbortController();
    redraw();
    try {
      item.response = await ask(request, controller.signal);
    } catch (error) {
      if (epoch !== generation) return;
      item.response = sourceGuidance(
        request,
        error.message ||
          t(
            'Gemini is unavailable. Here is official source guidance.',
            'Gemini no está disponible. Aquí tienes orientación oficial.',
          ),
      );
    } finally {
      if (epoch === generation) {
        capture();
        waiting = false;
        redraw();
      }
    }
  }
  function action(button) {
    if (button.dataset.action === 'assistant-example') {
      draft = button.dataset.question;
      redraw();
      document.querySelector('#assistant-question')?.focus();
      return true;
    }
    if (button.dataset.action === 'assistant-nav') {
      navigate(button.dataset.page);
      return true;
    }
    return false;
  }
  return { view, submit, action, capture, reset };
}
