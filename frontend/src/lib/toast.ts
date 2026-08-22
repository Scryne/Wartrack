export function showConfirmToast(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.style.cssText = `
      position:fixed; inset:0; z-index:9998; background:transparent;
    `;

    const el = document.createElement('div');
    el.style.cssText = `
      position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
      background:#091526; border:1px solid rgba(255,255,255,0.12);
      border-radius:8px; padding:14px 20px; z-index:9999;
      font-family:'Space Grotesk',sans-serif; font-size:13px;
      color:#F0F4F8; display:flex; align-items:center; gap:12px;
      box-shadow:0 8px 32px rgba(0,0,0,0.6);
      animation:slide-down 0.2s ease-out;
    `;

    // textContent, not innerHTML: the message is interpolated verbatim and
    // must never be able to inject markup.
    const label = document.createElement('span');
    label.textContent = message;

    const confirmButton = document.createElement('button');
    confirmButton.textContent = 'Evet, Sil';
    confirmButton.style.cssText = `
      padding:4px 14px;background:#FF3B3B;border:none;border-radius:4px;
      color:#fff;cursor:pointer;font-size:12px;
    `;

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Iptal';
    cancelButton.style.cssText = `
      padding:4px 14px;background:transparent;border:1px solid rgba(255,255,255,0.2);
      border-radius:4px;color:#94A3B8;cursor:pointer;font-size:12px;
    `;

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
