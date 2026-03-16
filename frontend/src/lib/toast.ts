export function showConfirmToast(message: string): Promise<boolean> {
  return new Promise((resolve) => {
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
    el.innerHTML = `
      <span>${message}</span>
      <button id='confirm-yes' style='padding:4px 14px;background:#FF3B3B;
        border:none;border-radius:4px;color:#fff;cursor:pointer;font-size:12px'>
        Evet, Sil
      </button>
      <button id='confirm-no' style='padding:4px 14px;background:transparent;
        border:1px solid rgba(255,255,255,0.2);border-radius:4px;
        color:#94A3B8;cursor:pointer;font-size:12px'>
        Iptal
      </button>
    `;
    document.body.appendChild(el);
    const cleanup = () => {
      el.remove();
    };
    el.querySelector('#confirm-yes')!.addEventListener('click', () => {
      cleanup();
      resolve(true);
    });
    el.querySelector('#confirm-no')!.addEventListener('click', () => {
      cleanup();
      resolve(false);
    });
  });
}
