/**
 * Inline confirmation for destructive actions. Styled by .wt-confirm in
 * index.css (tokens), not inline literals.
 */
export function showConfirmToast(message: string, confirmLabel = 'Sil'): Promise<boolean> {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'wt-confirm-backdrop';

    const el = document.createElement('div');
    el.className = 'wt-confirm';
    el.setAttribute('role', 'alertdialog');
    el.setAttribute('aria-modal', 'true');

    // textContent, not innerHTML: the message is interpolated verbatim and
    // must never be able to inject markup.
    const label = document.createElement('span');
    label.id = `wt-confirm-${Date.now()}`;
    label.textContent = message;
    el.setAttribute('aria-labelledby', label.id);

    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className = 'btn-primary wt-btn-sm wt-confirm-danger';
    confirmButton.textContent = confirmLabel;

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'btn-secondary wt-btn-sm';
    cancelButton.textContent = 'Vazgeç';

    el.append(label, confirmButton, cancelButton);

    // Settle exactly once, and always tear down. Previously the promise could
    // only resolve via the two buttons, so dismissing any other way leaked
    // both the node and a permanently pending promise.
    let settled = false;
    const settle = (value: boolean) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeyDown, true);
      backdrop.remove();
      el.remove();
      resolve(value);
    };

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        settle(false);
      }
    }

    confirmButton.addEventListener('click', () => settle(true));
    cancelButton.addEventListener('click', () => settle(false));
    backdrop.addEventListener('mousedown', () => settle(false));
    document.addEventListener('keydown', onKeyDown, true);

    document.body.append(backdrop, el);
    cancelButton.focus();
  });
}
