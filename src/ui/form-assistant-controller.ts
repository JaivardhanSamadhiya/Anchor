/** Contextual form help sends reviewed public question identifiers only. A
 * selection, typed question and draft answer never cross the cloud boundary. */
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
    const help = /proof|document|evidence|comprobante|documento/i.test(question)
      ? 'documents'
      : /fill|answer|enter|write|llenar|responder|escribir/i.test(question)
        ? 'how-to-answer'
        : 'meaning';
    const request = createFormContextRequest({ ...context, help }, language(), true);
    if (!request) return;
    const item: Message = { question };
    messages.push(item);
    if (messages.length > 6) messages.shift();
    question = '';
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
