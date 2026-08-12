/* ================================================================
   FOODLINE · ПУЛЬТ ДОДАТКІВ — сервіс-воркер

   ВАЖЛИВО ПРО МЕЖІ ДІЇ.
   Якщо пульт лежить у корені (yuriybuz.github.io), його область дії —
   увесь сайт, тобто й усі інші ваші додатки. Тому цей воркер свідомо
   НЕ перехоплює чужі запити: усе, що не належить пульту, він пропускає
   повз себе, і кожен додаток працює зі своїм власним воркером.

   ПІСЛЯ БУДЬ-ЯКОЇ ЗМІНИ index.html ПІДНІМІТЬ VERSION —
   інакше планшети триматимуть стару копію з кеша.
   ================================================================ */

const VERSION = 'v1';
const CACHE   = `fl-hub-${VERSION}`;
const FONTS   = `fl-hub-fonts-${VERSION}`;

/* Файли самого пульта — кладемо в кеш під час встановлення */
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

const FONT_HOSTS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

/* Чи належить запит пульту */
function isOurs(url){
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin) return false;
  if (!url.pathname.startsWith(scope.pathname)) return false;
  const tail = url.pathname.slice(scope.pathname.length);
  return tail === '' || SHELL.some(f => f.replace('./', '') === tail);
}

/* ---------- встановлення ---------- */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[sw] не вдалось прогріти кеш:', err))
  );
});

/* ---------- активація: прибираємо старі версії ---------- */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('fl-hub-') && k !== CACHE && k !== FONTS)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ---------- запити ---------- */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }

  /* Шрифти IBM Plex: віддаємо з кеша, паралельно оновлюємо */
  if (FONT_HOSTS.includes(url.origin)) {
    e.respondWith(
      caches.open(FONTS).then(async cache => {
        const hit = await cache.match(req);
        const live = fetch(req)
          .then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; })
          .catch(() => null);
        return hit || live || Response.error();
      })
    );
    return;
  }

  /* Чужі додатки й будь-що поза пультом — не чіпаємо */
  if (!isOurs(url)) return;

  /* Сторінка пульта: спершу мережа, потім кеш.
     Так свіжий каталог доїжджає одразу, а без мережі відкривається копія. */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html').then(hit => hit || caches.match('./')))
    );
    return;
  }

  /* Іконки й маніфест: спершу кеш */
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    }))
  );
});

/* ---------- миттєве оновлення на вимогу сторінки ---------- */
self.addEventListener('message', e => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});
