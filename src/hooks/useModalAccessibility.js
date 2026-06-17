import { useEffect } from 'react';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function isHidden(element) {
  return element.hasAttribute('hidden')
    || element.getAttribute('aria-hidden') === 'true'
    || element.closest('[hidden],[aria-hidden="true"]');
}

function getFocusableElements(container) {
  if (!container) {
    return [];
  }

  return Array.from(container.querySelectorAll(focusableSelector)).filter((element) => {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    return !isHidden(element);
  });
}

export function useModalAccessibility({ isOpen, modalRef, onClose, onEscape }) {
  useEffect(() => {
    if (!isOpen || !modalRef.current) {
      return undefined;
    }

    const modal = modalRef.current;
    const previousOverflow = document.body.style.overflow;
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    document.body.style.overflow = 'hidden';

    function focusInitialElement() {
      const focusable = getFocusableElements(modal);
      const preferred = modal.querySelector('.modal-close');
      const target = preferred instanceof HTMLElement ? preferred : focusable[0];

      if (target instanceof HTMLElement) {
        target.focus({ preventScroll: true });
        return;
      }

      modal.setAttribute('tabindex', '-1');
      modal.focus({ preventScroll: true });
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        if (onEscape) {
          onEscape();
        } else {
          onClose?.();
        }
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusable = getFocusableElements(modal);

      if (!focusable.length) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    const frameId = window.requestAnimationFrame(focusInitialElement);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.cancelAnimationFrame(frameId);
      document.body.style.overflow = previousOverflow;

      if (previousActiveElement && document.contains(previousActiveElement)) {
        previousActiveElement.focus({ preventScroll: true });
      }
    };
  }, [isOpen, modalRef, onClose, onEscape]);
}
