// Cloudflare Turnstile: a privacy-friendly "are you human" check on sign-in and sign-up.
// Switched on by TURNSTILE_SITE_KEY in config.js. Supabase checks the token server-side
// once CAPTCHA protection is enabled (Authentication → Attack Protection).
import * as CFG from './config.js';

const SITE_KEY = (CFG.TURNSTILE_SITE_KEY || '').trim();
export const captchaEnabled = Boolean(SITE_KEY);

let loading = null;
function loadScript() {
  loading ??= new Promise((resolve, reject) => {
    if (window.turnstile) { resolve(window.turnstile); return; }
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => resolve(window.turnstile);
    s.onerror = () => { loading = null; reject(new Error('Couldn’t load the security check. Check your connection and try again')); };
    document.head.appendChild(s);
  });
  return loading;
}

// Mounts the widget in `el`. Returns { token(), reset() }; token() waits until the check passes.
export async function mountCaptcha(el) {
  if (!captchaEnabled) return null;
  let current = null;
  let waiters = [];
  const settle = (tok) => { current = tok; const w = waiters; waiters = []; w.forEach((fn) => fn(tok)); };
  const ts = await loadScript();
  const dark = getComputedStyle(document.documentElement).colorScheme.includes('dark');
  const id = ts.render(el, {
    sitekey: SITE_KEY,
    theme: dark ? 'dark' : 'light',
    size: 'flexible',
    appearance: 'interaction-only',     // stays hidden unless Cloudflare needs a click
    callback: (tok) => settle(tok),
    'expired-callback': () => { current = null; ts.reset(id); },
    'error-callback': () => { current = null; },
  });
  return {
    token(timeoutMs = 15000) {
      if (current) return Promise.resolve(current);
      return new Promise((resolve) => {
        const t = setTimeout(() => resolve(null), timeoutMs);
        waiters.push((tok) => { clearTimeout(t); resolve(tok); });
      });
    },
    reset() { current = null; try { ts.reset(id); } catch { /* ignore */ } },
  };
}
