// Camera barcode scanner for books (ISBN / EAN-13) and comics (UPC-A + 5-digit add-on).
// Uses the browser's built-in BarcodeDetector when available (Android Chrome), and the
// bundled ZXing decoder everywhere else (iPhone, desktop). ZXing also reads the small
// add-on barcode on comics, which carries the issue number.
//
//   const r = await scanBarcode({ title: 'Scan a book' });
//   // -> { code: '9780735211292', addon: null } | { code: '761941200040', addon: '00111' } | null (cancelled)

import { esc } from './ui.js';

let zx = null;
const loadZxing = () => (zx ??= import('./vendor/zxing.js'));

const RETAIL = new Set(['ean_13', 'upc_a', 'ean_8', 'upc_e']);
const looksValid = (code) => /^\d{8}$|^\d{12,13}$/.test(code);

export function cameraSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext);
}

export function scanBarcode({ title = 'Scan barcode', hint = 'Line the barcode up inside the box' } = {}) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'scanner';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-label', title);
    ov.innerHTML = `
      <div class="scan-top"><p class="scan-title">${esc(title)}</p>
        <button type="button" class="icon-btn scan-close" aria-label="Close scanner">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
      <div class="scan-stage"><video playsinline muted autoplay></video><div class="scan-box"><i></i></div></div>
      <p class="scan-hint" aria-live="polite">${esc(hint)}</p>
      <form class="scan-manual row"><input inputmode="numeric" autocomplete="off" placeholder="Or type the number" aria-label="Barcode number"><button class="btn sm">Use</button></form>`;
    document.body.appendChild(ov);
    const video = ov.querySelector('video');
    const hintEl = ov.querySelector('.scan-hint');
    let stream = null, done = false, timer = null, upcSeenAt = 0, pendingUpc = null;

    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      document.removeEventListener('keydown', onKey);
      ov.remove();
      if (result && navigator.vibrate) navigator.vibrate(40);
      resolve(result);
    };
    const onKey = (e) => { if (e.key === 'Escape') finish(null); };
    document.addEventListener('keydown', onKey);
    ov.querySelector('.scan-close').onclick = () => finish(null);
    ov.querySelector('.scan-manual').onsubmit = (e) => {
      e.preventDefault();
      const v = e.target.querySelector('input').value.replace(/[^0-9X]/gi, '').toUpperCase();
      if (v.length >= 8) finish({ code: v, addon: null, typed: true });
    };

    (async () => {
      if (!cameraSupported()) { hintEl.textContent = 'Camera not available here. Type the number below instead.'; return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch (err) {
        hintEl.textContent = err?.name === 'NotAllowedError'
          ? 'Camera permission was blocked. Allow it in your browser settings, or type the number below.'
          : 'Couldn’t open the camera. Type the number below instead.';
        return;
      }
      if (done) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.srcObject = stream;
      try { await video.play(); } catch { /* autoplay quirks; frames still arrive */ }

      // Built-in detector if it can read retail barcodes.
      let native = null;
      try {
        if ('BarcodeDetector' in window) {
          const fmts = await window.BarcodeDetector.getSupportedFormats();
          if (fmts.some((f) => RETAIL.has(f))) native = new window.BarcodeDetector({ formats: fmts.filter((f) => RETAIL.has(f)) });
        }
      } catch { native = null; }

      let lib = null, reader = null;
      const ensureLib = async () => {
        if (reader) return true;
        try {
          lib = await loadZxing();
          const hints = new Map();
          hints.set(lib.DecodeHintType.POSSIBLE_FORMATS, [lib.BarcodeFormat.EAN_13, lib.BarcodeFormat.UPC_A, lib.BarcodeFormat.EAN_8, lib.BarcodeFormat.UPC_E]);
          hints.set(lib.DecodeHintType.TRY_HARDER, true);
          reader = new lib.MultiFormatOneDReader(hints);
          return true;
        } catch { return false; }
      };
      if (!native) { hintEl.textContent = 'Loading scanner…'; if (!(await ensureLib())) { hintEl.textContent = 'Scanner failed to load. Type the number below.'; return; } hintEl.textContent = hint; }
      else ensureLib(); // warm up for reading comic add-ons

      const canvas = document.createElement('canvas');
      const cx = canvas.getContext('2d', { willReadFrequently: true });

      const zxingDecode = () => {
        const vw = video.videoWidth, vh = video.videoHeight;
        if (!vw || !vh || !reader) return null;
        // Scan the middle band of the frame, where the guide box is.
        const w = Math.min(vw, 1280), h = Math.round(Math.min(vh, w * 0.5));
        const sx = Math.round((vw - w) / 2), sy = Math.round((vh - h) / 2);
        canvas.width = w; canvas.height = h;
        cx.drawImage(video, sx, sy, w, h, 0, 0, w, h);
        const px = cx.getImageData(0, 0, w, h).data;
        const lum = new Uint8ClampedArray(w * h);
        for (let i = 0, j = 0; i < lum.length; i++, j += 4) lum[i] = (px[j] * 77 + px[j + 1] * 150 + px[j + 2] * 29) >> 8;
        try {
          const bmp = new lib.BinaryBitmap(new lib.HybridBinarizer(new lib.RGBLuminanceSource(lum, w, h)));
          const res = reader.decode(bmp);
          const code = res.getText();
          let addon = null;
          if (code.length === 12 || (code.length === 13 && code.startsWith('0'))) {
            // Comic add-on: look just right of the main barcode, on the row it was read from and a few nearby.
            const pts = res.getResultPoints();
            const y0 = Math.round(pts[0].getY()), x = Math.round(pts[pts.length - 1].getX());
            for (const dy of [0, -8, 8, -16, 16, 24]) {
              const y = y0 + dy;
              if (y < 0 || y >= h) continue;
              addon = lib.readAddon5(bmp.getBlackRow(y, null), x);
              if (addon) break;
            }
          }
          return { code, addon };
        } catch { return null; }
        finally { reader.reset(); }
      };

      const isUpc = (code) => code.length === 12 || (code.length === 13 && code.startsWith('0'));

      const tick = async () => {
        if (done) return;
        let hit = null;
        if (native) {
          try {
            const found = await native.detect(video);
            const r = found.find((b) => looksValid(b.rawValue));
            if (r) hit = { code: r.rawValue, addon: null };
          } catch { /* frame not ready */ }
          // Comic barcodes: give ZXing a moment to also catch the add-on (issue number).
          if (hit && isUpc(hit.code) && reader) {
            const z = zxingDecode();
            if (z?.addon) hit = z;
            else if (Date.now() - (upcSeenAt ||= Date.now()) < 900) { pendingUpc = hit; hit = null; }
          }
        } else {
          hit = zxingDecode();
          if (hit && !hit.addon && isUpc(hit.code) && Date.now() - (upcSeenAt ||= Date.now()) < 900) { pendingUpc = hit; hit = null; }
        }
        if (!hit && pendingUpc && Date.now() - upcSeenAt >= 900) hit = pendingUpc;
        if (hit && looksValid(hit.code)) {
          // UPC-A comes back from EAN-13 readers with a leading 0; keep the 12-digit form.
          if (hit.code.length === 13 && hit.code.startsWith('0')) hit.code = hit.code.slice(1);
          finish(hit); return;
        }
        timer = setTimeout(tick, native ? 120 : 160);
      };
      video.addEventListener('loadeddata', () => tick(), { once: true });
      if (video.readyState >= 2) tick();
    })();
  });
}

/** For comics: the 5-digit add-on is III-C-P (issue, cover variant, printing). */
export function issueFromAddon(addon) {
  if (!/^\d{5}$/.test(addon || '')) return null;
  const n = parseInt(addon.slice(0, 3), 10);
  return n > 0 ? String(n) : null;
}
