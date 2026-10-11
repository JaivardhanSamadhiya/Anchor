/**
 * A small coach mark for a next action selected by the application. This module
 * never decides whether a date is verified or a document has been submitted.
 * It points to an existing enabled control and lets its normal handler run.
 */
export interface NextStepCue {
  /** A stable notice/stage key; dismissed stages stay quiet until the key changes. */
  key: string;
  selector: string;
  title: string;
  detail?: string;
  actionLabel?: string;
}

export interface NextStepCueOptions {
  getText?: () => { eyebrow: string; dismiss: string; continue: string };
}

export function createNextStepCue({ getText }: NextStepCueOptions = {}) {
  const text = () =>
    getText?.() ?? {
      eyebrow: 'Your next step',
      dismiss: 'Dismiss this hint',
      continue: 'Go to this step',
    };
  const card = document.createElement('aside');
  card.className = 'anchor-next-step';
  card.hidden = true;
  card.setAttribute('aria-labelledby', 'anchor-next-step-title');
  card.innerHTML = `<div class="anchor-next-step-heading"><span class="anchor-next-step-eyebrow"></span><button type="button" class="anchor-next-step-dismiss">×</button></div><p id="anchor-next-step-title" class="anchor-next-step-title"></p><p id="anchor-next-step-description" class="anchor-next-step-description"></p><button type="button" class="anchor-next-step-continue"></button>`;
  const announcement = document.createElement('span');
  announcement.className = 'anchor-next-step-status';
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', 'polite');
  announcement.setAttribute('aria-atomic', 'true');
  document.body.append(card, announcement);

  const eyebrow = card.querySelector<HTMLElement>('.anchor-next-step-eyebrow')!;
  const title = card.querySelector<HTMLElement>('.anchor-next-step-title')!;
  const detail = card.querySelector<HTMLElement>('.anchor-next-step-description')!;
  const dismissButton = card.querySelector<HTMLButtonElement>('.anchor-next-step-dismiss')!;
  const continueButton = card.querySelector<HTMLButtonElement>('.anchor-next-step-continue')!;
  const dismissed = new Set<string>();
  let current: NextStepCue | null = null;
  let target: HTMLElement | null = null;
  let frame = 0;
  let destroyed = false;
  let announcedKey: string | null = null;
  const descriptionId = 'anchor-next-step-description';

  function detachTarget() {
    if (!target) return;
    target.classList.remove('anchor-next-action-target');
    const descriptions = (target.getAttribute('aria-describedby') || '')
      .split(/\s+/)
      .filter((id) => id && id !== descriptionId);
    if (descriptions.length) target.setAttribute('aria-describedby', descriptions.join(' '));
    else target.removeAttribute('aria-describedby');
    target = null;
  }

  function hide() {
    card.hidden = true;
    detachTarget();
  }

  function actionable(element: Element | null): element is HTMLElement {
    return Boolean(
      element instanceof HTMLElement &&
      element.matches('button, a[href], input[type="checkbox"], input[type="radio"]') &&
      !element.matches(':disabled, [aria-disabled="true"]') &&
      !element.closest('[inert]'),
    );
  }

  function position() {
    if (destroyed || card.hidden || !target?.isConnected) return;
    const padding = 12;
    const box = target.getBoundingClientRect();
    const width = Math.min(310, innerWidth - padding * 2);
    card.style.width = `${width}px`;
    const height = card.getBoundingClientRect().height;
    const visible =
      box.width > 0 &&
      box.height > 0 &&
      box.right > 0 &&
      box.left < innerWidth &&
      box.bottom > 0 &&
      box.top < innerHeight;
    const left = visible
      ? Math.min(innerWidth - width - padding, Math.max(padding, box.left))
      : innerWidth - width - padding;
    // Keep the hinted control uncovered. For an offscreen control, the button
    // brings it into view before it receives keyboard focus and activation.
    const top =
      visible && box.top - height - 12 >= padding
        ? box.top - height - 12
        : visible && box.bottom + height + 12 <= innerHeight - padding
          ? box.bottom + 12
          : Math.max(padding, innerHeight - height - padding);
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    card.classList.toggle('anchor-next-step-offscreen', !visible);
  }

  function schedulePosition() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(position);
  }

  function refresh() {
    if (destroyed) return;
    if (
      !current ||
      dismissed.has(current.key) ||
      document.querySelector('dialog[open]') ||
      document.querySelector('#app[inert]')
    ) {
      hide();
      return;
    }
    let candidate: Element | null;
    try {
      candidate = document.querySelector(current.selector);
    } catch {
      // A malformed selector must not prevent the rest of the app from working.
      hide();
      return;
    }
    if (!actionable(candidate)) {
      hide();
      return;
    }
    if (candidate !== target) {
      detachTarget();
      target = candidate;
      target.classList.add('anchor-next-action-target');
      const descriptions = (target.getAttribute('aria-describedby') || '').split(/\s+/);
      target.setAttribute(
        'aria-describedby',
        [...new Set([...descriptions.filter(Boolean), descriptionId])].join(' '),
      );
    }
    const copy = text();
    eyebrow.textContent = copy.eyebrow;
    title.textContent = current.title;
    detail.textContent = current.detail || current.title;
    detail.hidden = !current.detail;
    dismissButton.setAttribute('aria-label', copy.dismiss);
    continueButton.textContent = current.actionLabel || copy.continue;
    card.hidden = false;
    if (announcedKey !== current.key) {
      announcement.textContent = `${copy.eyebrow}: ${current.title}`;
      announcedKey = current.key;
    }
    schedulePosition();
  }

  function dismiss() {
    if (current) dismissed.add(current.key);
    hide();
  }

  function activate() {
    const control = target;
    if (!actionable(control)) return;
    dismiss();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    control.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'center' });
    control.focus({ preventScroll: true });
    control.click();
  }

  function onAction(event: MouseEvent) {
    if (target && event.target instanceof Node && target.contains(event.target)) dismiss();
  }

  // Modal and account transitions happen outside the controller. Watching only
  // their attributes also resumes a cue after a tour closes without polling.
  const observer = new MutationObserver(refresh);
  observer.observe(document.body, {
    attributes: true,
    subtree: true,
    attributeFilter: ['open', 'inert'],
  });
  dismissButton.addEventListener('click', dismiss);
  continueButton.addEventListener('click', activate);
  document.addEventListener('click', onAction, true);
  window.addEventListener('resize', schedulePosition);
  window.addEventListener('scroll', schedulePosition, true);

  return {
    update(next: NextStepCue | null) {
      current = next;
      refresh();
    },
    refresh,
    destroy() {
      if (destroyed) return;
      hide();
      destroyed = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener('click', onAction, true);
      window.removeEventListener('resize', schedulePosition);
      window.removeEventListener('scroll', schedulePosition, true);
      card.remove();
      announcement.remove();
    },
  };
}
