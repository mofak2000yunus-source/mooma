/* BİRİNCİLER — Service Worker: العمل بدون إنترنت
   - ملفات التطبيق (index.html وشعارات): الشبكة أولاً (مهلة 4 ثوانٍ) ثم النسخة المحفوظة
   - مكتبات Firebase و xlsx والخط: تُحفظ عند أول فتح وتُخدم من الجهاز
   - الصور: تُخدم من الجهاز إن وُجدت، وإلا تُجلب وتُحفظ (والتحميل الكامل من داخل التطبيق)
   - ملف الإكسل (الأسعار) وFirebase: لا يتدخل فيها هذا الملف أبداً — يتولاها التطبيق نفسه
   غيّر VERSION عند أي تعديل على هذا الملف. */
const VERSION = '2026-10-30.2';
const SHELL = 'mooma-shell-' + VERSION;
const LIB   = 'mooma-lib-v1';
const IMG   = 'mooma-img-v1';
const GH_HOST = 'raw.githubusercontent.com';
const LIB_HOSTS = ['www.gstatic.com', 'cdnjs.cloudflare.com', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const LIBS = [
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage-compat.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap'
];
const SHELL_FILES = ['./', 'index.html', 'logo-home.webp', 'logo-home.png', 'logo-home.jpg', 'logo-home.jpeg', 'logo-app.png', 'manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const sc = await caches.open(SHELL);
    await Promise.allSettled(SHELL_FILES.map(f => sc.add(new Request(f, { cache: 'reload' }))));
    const lc = await caches.open(LIB);
    await Promise.allSettled(LIBS.map(async u => {
      if (await lc.match(u)) return;
      const r = await fetch(u, { mode: 'cors', credentials: 'omit' });
      if (!r.ok) throw new Error(u);
      await lc.put(u, r.clone());
      if (u.indexOf('fonts.googleapis.com') > -1) {          // ملفات الخط التي يشير إليها الـ CSS
        const css = await r.text();
        const urls = [...css.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]);
        await Promise.allSettled(urls.map(async f => {
          if (await lc.match(f)) return;
          const fr = await fetch(f, { mode: 'cors', credentials: 'omit' });
          if (fr.ok) await lc.put(f, fr);
        }));
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.indexOf('mooma-shell-') === 0 && k !== SHELL) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    if (url.pathname.slice(-6) === '/sw.js') return;
    if (req.mode === 'navigate') return e.respondWith(navFirst(req));
    return e.respondWith(swr(e, SHELL));
  }
  // الصور فقط (طلبات <img>) — أما fetch فيتولاها التطبيق بنفسه
  if (req.destination === 'image' && (url.hostname === GH_HOST || url.hostname === 'firebasestorage.googleapis.com')) {
    return e.respondWith(imgFirst(req));
  }
  if (LIB_HOSTS.indexOf(url.hostname) > -1) return e.respondWith(libFirst(req));
});

async function navFirst(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))
    ]);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return (await cache.match(req, { ignoreSearch: true })) ||
           (await cache.match('./')) || (await cache.match('index.html')) || Response.error();
  }
}

async function swr(e, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(e.request);
  const net = fetch(e.request).then(r => { if (r && r.ok) cache.put(e.request, r.clone()); return r; }).catch(() => null);
  if (hit) { e.waitUntil(net); return hit; }
  return (await net) || Response.error();
}

async function imgFirst(req) {
  const cache = await caches.open(IMG);
  const hit = await cache.match(req.url, { ignoreVary: true });
  if (hit) return hit;
  try {
    let res;
    try { res = await fetch(req.url, { mode: 'cors', credentials: 'omit' }); }
    catch (_) { res = await fetch(req); }                    // مضيف بلا CORS
    if (res.ok || res.type === 'opaque') cache.put(req.url, res.clone()).catch(() => {});
    return res;
  } catch (err) { return Response.error(); }
}

async function libFirst(req) {
  const cache = await caches.open(LIB);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  try {
    let res;
    try { res = await fetch(req.url, { mode: 'cors', credentials: 'omit' }); }
    catch (_) { res = await fetch(req); }
    if (res.ok || res.type === 'opaque') cache.put(req.url, res.clone()).catch(() => {});
    return res;
  } catch (err) { return Response.error(); }
}
