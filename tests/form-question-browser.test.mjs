import test from 'node:test';
import assert from 'node:assert/strict';

// Run the shipped controller in an isolated browser with fictional form data.
// Auth and the AI transport are fixtures; no real account or provider is used.
const enabled = Boolean(
  process.env.ANCHOR_BROWSER_TEST_URL && process.env.ANCHOR_PLAYWRIGHT_MODULE,
);

async function runQuestion(question) {
  const { chromium } = await import(process.env.ANCHOR_PLAYWRIGHT_MODULE);
  const instance = await chromium.launch({
    headless: true,
    ...(process.env.ANCHOR_BROWSER_EXECUTABLE
      ? { executablePath: process.env.ANCHOR_BROWSER_EXECUTABLE }
      : {}),
  });
  try {
    const context = await instance.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() =>
      sessionStorage.setItem('anchor-guide-session-v2', 'dismissed'),
    );
    await page.goto(process.env.ANCHOR_BROWSER_TEST_URL);
    await page.locator('.shell').waitFor();
    await page.waitForFunction(() => !document.querySelector('#app')?.inert);
    const result = await page.evaluate(async (question) => {
      const { createFormAssistant } = await import(
        new URL('form-assistant-controller.js', location.href).href
      );
      const { getFormAssistance } = await import(
        new URL('form-assistance.js', location.href).href
      );
      const { sourceGuidance } = await import(
        new URL('program-assistant.js', location.href).href
      );
      const current = {
        assistance: getFormAssistance({
          id: 'fictional-form-question',
          supported: true,
          program: 'CalFresh',
          type: 'renewal',
          sourceText: 'Fictional CF 37 recertification request.',
          deadlines: [],
          requests: [
            {
              id: 'form',
              kind: 'form',
              title: 'Return CF 37',
              quote: 'Return CF 37',
              status: 'todo',
            },
          ],
        }),
        section: 0,
      };
      const host = document.createElement('div');
      document.body.append(host);
      const calls = [];
      const helper = createFormAssistant({
        getForm: () => current,
        getAccount: () => ({ authenticated: true }),
        getLanguage: () => 'en',
        redraw: () => {
          host.innerHTML = helper.view();
        },
        ask: async (request) => {
          calls.push(request);
          return sourceGuidance(request);
        },
      });
      host.innerHTML = helper.view();
      helper.choose('identity', 'mailingStreet');
      host.querySelector('#form-assistant-question').value = question;
      host.querySelector('#form-assistant-adult').checked = true;
      await helper.submit(host.querySelector('form'));
      const answer = host.querySelector('.form-assistant-answer');
      const result = {
        calls,
        answer: answer?.textContent || '',
        label: answer?.querySelector('.form-assistant-answer-label')?.textContent || '',
        urls: [...(answer?.querySelectorAll('a') || [])].map((link) => link.href),
        context: host.querySelector('#form-assistant-context')?.textContent || '',
        questionAfter: host.querySelector('#form-assistant-question').value,
      };
      helper.reset();
      host.remove();
      return result;
    }, question);
    assert.deepEqual(errors, [], 'the shipped controller has no browser errors');
    return result;
  } finally {
    await instance.close();
  }
}

test(
  'form chat answers a fictional city lookup honestly on device even when cloud help is enabled',
  { skip: !enabled, timeout: 60_000 },
  async () => {
    const result = await runQuestion('I live at 123 Fictional Street, what is my city?');
    assert.equal(result.calls.length, 0, 'a street address must never enter a cloud request');
    assert.equal(result.label, 'Anchor · On-device help');
    assert.match(result.answer, /ZIP/i);
    assert.match(result.answer, /state/i);
    assert.match(result.answer, /cannot|can’t|can't|not enough|need|unable/i);
    assert.ok(result.urls.includes('https://tools.usps.com/go/ZipLookup.htm'));
    assert.equal(
      result.urls.some((url) => /Fictional|123|\?/.test(url)),
      false,
      'the official lookup link contains no address or lookup parameters',
    );
    assert.doesNotMatch(result.answer, /copy the case name and case number/i);
    assert.equal(result.questionAfter, '', 'the submitted draft is cleared');
  },
);

test(
  'form chat asks for relevant context instead of explaining the selected address for an unrelated question',
  { skip: !enabled, timeout: 60_000 },
  async () => {
    const result = await runQuestion('Who won the football game?');
    assert.equal(result.calls.length, 0);
    assert.equal(result.label, 'Anchor · On-device help');
    assert.match(result.answer, /which|what part|tell me|choose|select/i);
    assert.match(result.answer, /form|question|field/i);
    assert.doesNotMatch(result.answer, /mailing address, city, state|copy the case name/i);
    assert.equal(result.questionAfter, '');
  },
);

test(
  'form chat routes a gross-income question away from the selected address using only public enums',
  { skip: !enabled, timeout: 60_000 },
  async () => {
    const result = await runQuestion('Is gross income before or after taxes?');
    assert.equal(result.calls.length, 1);
    const request = result.calls[0];
    assert.equal(request.formContext.formId, 'cf37');
    assert.equal(request.formContext.sectionId, 'income');
    assert.equal(request.formContext.help, 'meaning');
    assert.notEqual(request.formContext.fieldId, 'mailingStreet');
    assert.deepEqual(Object.keys(request).sort(), [
      'adultConfirmed',
      'focus',
      'formContext',
      'language',
      'program',
      'questionId',
    ]);
    assert.doesNotMatch(JSON.stringify(request), /before or after|taxes|Fictional Street/);
    assert.match(result.answer, /gross[\s\S]*before[\s\S]*deductions/i);
    assert.doesNotMatch(result.answer, /copy the case name and case number/i);
    assert.equal(result.questionAfter, '');
  },
);
