/** AI form help sends reviewed public question identifiers only. A separate
 * postal lookup sends only a supplied ZIP. Selection text, typed questions and
 * draft answers are never sent to either provider. */
import type { FormAssistance } from '../domain/form-assistance.js';
import {
  createFormContextRequest,
  formContextPreview,
  parseFormContext,
  sourceGuidance,
  type AssistantRequest,
  type AssistantResponse,
  type FormContext,
} from '../domain/program-assistant.js';
import { renderFormAssistantPanel } from './form-assistance-view.js';
import { resolveFormQuestion } from '../domain/form-question.js';
import { lookupPostalPlaces } from '../infrastructure/postal-lookup.js';

interface CurrentForm {
  assistance: FormAssistance;
  section: number;
}
interface FormAssistantOptions {
  getForm: () => CurrentForm | null;
  getAccount: () => { authenticated: boolean };
  getLanguage: () => string;
  ask: (request: AssistantRequest, signal: AbortSignal) => Promise<AssistantResponse>;
  redraw: () => void;
}
interface Message {
  question: string;
  answer?: string;
  mode?: string;
  citations?: { title: string; url: string }[];
  message?: string;
}
const normalized = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function createFormAssistant(options: FormAssistantOptions) {
  let selected: FormContext | null = null;
  let question = '';
  let adultConfirmed = false;
  let waiting = false;
  let awaitingPostalCity = false;
  let generation = 0;
  let controller: AbortController | undefined;
  let selectionContext: FormContext | null = null;
  const messages: Message[] = [];
  const language = () => (options.getLanguage() === 'es' ? 'es' : 'en');
  const t = (en: string, es: string) => (language() === 'es' ? es : en);

  function contextFor(sectionId: string, fieldId?: string): FormContext | null {
    const current = options.getForm();
    if (!current?.assistance.form) return null;
    const context = {
      formId: current.assistance.form.id,
      sectionId,
      ...(fieldId ? { fieldId } : {}),
      help: 'meaning',
    };
    // New table rows can receive reviewed section guidance without guessing a
    // public field mapping. The server still reconstructs every prompt.
    return parseFormContext(context) || parseFormContext({ ...context, fieldId: undefined });
  }

  function currentContext(): FormContext | null {
    const current = options.getForm();
    if (!current?.assistance.form) return null;
    if (selected?.formId === current.assistance.form.id) return selected;
    const section = current.assistance.sections[current.section];
    return section ? contextFor(section.id) : null;
  }

  function capture(root: ParentNode = document) {
    const input = root.querySelector<HTMLTextAreaElement>('#form-assistant-question');
    if (input) question = input.value;
    const consent = root.querySelector<HTMLInputElement>('#form-assistant-adult');
    if (consent) adultConfirmed = consent.checked;
  }

  function reset() {
    generation++;
    controller?.abort();
    selected = null;
    selectionContext = null;
    question = '';
    adultConfirmed = false;
    waiting = false;
    awaitingPostalCity = false;
    messages.length = 0;
    // A still-mounted panel may be captured by the next modal render. Clear it
    // too, so unfinished questions cannot cross notice or account boundaries.
    const input = document.querySelector<HTMLTextAreaElement>('#form-assistant-question');
    if (input) input.value = '';
    const consent = document.querySelector<HTMLInputElement>('#form-assistant-adult');
    if (consent) consent.checked = false;
  }

  function questions() {
    return (options.getForm()?.assistance.sections || []).flatMap((section) => [
      { id: section.id, label: section.title },
      ...section.fields
        .filter((field) =>
          parseFormContext({
            formId: options.getForm()?.assistance.form?.id,
            sectionId: section.id,
            fieldId: field.id,
            help: 'meaning',
          }),
        )
        .map((field) => ({ id: `${section.id}|${field.id}`, label: field.label })),
    ]);
  }

  function view(): string {
    const context = currentContext();
    return renderFormAssistantPanel({
      contextLabel: context ? formContextPreview(context, language()) : '',
      contextId: context
        ? `${context.sectionId}${context.fieldId ? `|${context.fieldId}` : ''}`
        : '',
      question,
      adultConfirmed,
      authenticated: options.getAccount().authenticated,
      waiting,
      available: Boolean(context),
      messages,
      publicQuestions: questions(),
      lang: language(),
    });
  }

  function choose(sectionId: string, fieldId?: string) {
    capture();
    selected = contextFor(sectionId, fieldId);
    awaitingPostalCity = false;
    if (!selected) return false;
    if (!question.trim()) question = t('Explain this question.', 'Explica esta pregunta.');
    options.redraw();
    document.querySelector<HTMLTextAreaElement>('#form-assistant-question')?.focus();
    return true;
  }

  /** Retain only a validated identifier. Do not retain the highlighted text. */
  function captureSelection() {
    selectionContext = null;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const text = normalized(selection.toString().slice(0, 1200));
    if (!text) return;
    const node = selection.anchorNode;
    const element = node instanceof Element ? node : node?.parentElement;
    if (!element || !element.closest('.form-assistance')) return;
    if (element.closest('input, textarea, .form-assistant-panel')) return;
    const current = options.getForm();
    if (!current) return;
    const direct = element.closest<HTMLElement>('[data-form-help-field]')?.dataset.formHelpField;
    if (direct) {
      const section = current.assistance.sections.find((item) =>
        item.fields.some((field) => field.id === direct),
      );
      if (section) selectionContext = contextFor(section.id, direct);
      return;
    }
    if (!element.closest('#form-preview-text-layer')) return;
    const candidates = current.assistance.sections.flatMap((section) =>
      section.fields.map((field) => ({ section, field })),
    );
    const exact = candidates.find(({ field }) => {
      const label = normalized(field.label);
      return text.length >= 5 && (label.includes(text) || text.includes(label));
    });
    if (exact) selectionContext = contextFor(exact.section.id, exact.field.id);
    else {
      // Even if a filled answer was selected, only the current public section
      // can be explained. Its label is shown for review before the user asks.
      const section = current.assistance.sections[current.section];
      if (section) selectionContext = contextFor(section.id);
    }
  }

  function action(button: HTMLElement): boolean {
    if (button.dataset.action === 'form-ask-field') {
      const current = options.getForm();
      const fieldId = button.dataset.field;
      const section = current?.assistance.sections.find((item) =>
        item.fields.some((field) => field.id === fieldId),
      );
      if (section) choose(section.id, fieldId);
      return true;
    }
    if (button.dataset.action === 'form-ask-selection') {
      if (!selectionContext) captureSelection();
      const context = selectionContext || currentContext();
      if (context) choose(context.sectionId, context.fieldId);
      return true;
    }
    return false;
  }

  function changeContext(value: string) {
    const [sectionId, fieldId] = value.split('|');
    choose(sectionId, fieldId);
  }

  async function submit(form: HTMLFormElement) {
    if (waiting) return;
    capture(form);
    const context = currentContext();
    if (!context || !question.trim()) return;
    const resolved = resolveFormQuestion(question, context, language(), awaitingPostalCity);
    const item: Message = { question };
    messages.push(item);
    if (messages.length > 6) messages.shift();
    question = '';
    if (resolved.kind === 'postal-lookup') {
      awaitingPostalCity = true;
      const epoch = generation;
      const verificationLinks = [
        {
          title: t('USPS: confirm the complete address', 'USPS: confirmar dirección completa'),
          url: 'https://tools.usps.com/go/ZipLookup.htm',
        },
      ];
      if (!navigator.onLine) {
        Object.assign(item, {
          mode: 'device',
          citations: verificationLinks,
          answer: t(
            'ZIP lookup needs an internet connection. Reconnect and send the ZIP again, or check a recent piece of mail. I have not verified a city.',
            'La consulta postal necesita conexión. Conéctate y envía el código otra vez o revisa correo reciente. No he verificado una ciudad.',
          ),
        });
        options.redraw();
        return;
      }
      waiting = true;
      controller = new AbortController();
      options.redraw();
      try {
        const result = await lookupPostalPlaces(resolved.zip, controller.signal);
        if (epoch !== generation) return;
        const places = result.places.map(
          (place) => `${place.city}, ${place.state} (${place.stateCode})`,
        );
        Object.assign(item, {
          mode: 'postal',
          answer:
            result.places.length === 1
              ? t(
                  `ZIP ${result.zip} is listed for ${places[0]}. If this is the correct ZIP for your mailing address, ${result.places[0].city} is the city associated with that ZIP. This ZIP-only lookup does not verify your street address; check USPS if the full address is uncertain.`,
                  `El código ${result.zip} corresponde a ${places[0]}. Si es el código correcto de tu dirección postal, ${result.places[0].city} es la ciudad asociada. Esta consulta solo del código no verifica tu calle; consulta USPS si hay dudas sobre la dirección completa.`,
                )
              : t(
                  `ZIP ${result.zip} lists multiple places: ${places.join('; ')}. I have not chosen a mailing city. Compare your complete mailing address with USPS to confirm the name to use.`,
                  `El código ${result.zip} incluye varios lugares: ${places.join('; ')}. No he elegido una ciudad postal. Compara tu dirección completa con USPS para confirmar el nombre que debes usar.`,
                ),
          citations: [
            {
              title: t(
                'Zippopotam.us / GeoNames: ZIP lookup',
                'Zippopotam.us / GeoNames: consulta postal',
              ),
              url: result.sourceUrl,
            },
            {
              title: t('USPS: confirm the complete address', 'USPS: confirmar dirección completa'),
              url: 'https://tools.usps.com/go/ZipLookup.htm',
            },
          ],
          message: t(
            'Only the five-digit ZIP was sent to the lookup service. Your street address and conversation were not sent.',
            'Solo se envió el código de cinco dígitos al servicio postal. No se enviaron tu calle ni conversación.',
          ),
        });
        awaitingPostalCity = false;
      } catch (error) {
        if (epoch !== generation) return;
        Object.assign(item, {
          mode: 'device',
          citations: verificationLinks,
          answer:
            error && typeof error === 'object' && 'code' in error && error.code === 'not-found'
              ? t(
                  'The lookup found no entry for that ZIP code. Check the five digits against your mailing address or use USPS. I have not verified a city.',
                  'No se encontró ese código postal. Verifica los cinco dígitos de tu dirección o usa USPS. No he verificado una ciudad.',
                )
              : t(
                  'The ZIP lookup is unavailable right now. I have not verified a city. Try again when connected or use USPS; this was not sent to Anchor AI.',
                  'La consulta postal no está disponible ahora. No he verificado una ciudad. Inténtalo con conexión o usa USPS; no se envió a la IA de Anchor.',
                ),
        });
      } finally {
        if (epoch === generation) {
          capture();
          waiting = false;
          options.redraw();
        }
      }
      return;
    }
    if (resolved.kind === 'local') {
      awaitingPostalCity = Boolean(resolved.awaitingPostalCity);
      Object.assign(item, {
        answer: resolved.answer,
        mode: 'device',
        citations: resolved.citations,
      });
      options.redraw();
      return;
    }
    awaitingPostalCity = false;
    selected = resolved.context;
    const request = createFormContextRequest(resolved.context, language(), true);
    if (!request) return;
    const epoch = generation;
    const apply = (response: AssistantResponse) =>
      Object.assign(item, {
        answer: response.answer,
        mode: response.mode,
        citations: response.citations,
        message: response.message,
      });
    if (!adultConfirmed || !options.getAccount().authenticated || !navigator.onLine) {
      apply(
        sourceGuidance(
          request,
          t(
            'Official form guidance. No AI request was sent.',
            'Guía oficial del formulario. No se envió una solicitud de IA.',
          ),
        ),
      );
      options.redraw();
      return;
    }
    waiting = true;
    controller = new AbortController();
    options.redraw();
    try {
      const response = await options.ask(request, controller.signal);
      if (epoch === generation) apply(response);
    } catch {
      if (epoch === generation)
        apply(
          sourceGuidance(
            request,
            t(
              'Anchor AI is unavailable. Here is the official form guidance.',
              'La IA de Anchor no está disponible. Aquí tienes la guía oficial.',
            ),
          ),
        );
    } finally {
      if (epoch === generation) {
        capture();
        waiting = false;
        options.redraw();
      }
    }
  }

  return { view, capture, reset, choose, captureSelection, action, changeContext, submit };
}
