/* Cache isolata per il percorso della PWA. */
const VERSION='2.0.0';
const PREFIX='schede-restauro:'+self.registration.scope+':';
const CACHE=PREFIX+VERSION;
const FILES=[
  "./",
  "./app.bundle.js",
  "./assets/beni.json",
  "./assets/home-landscape.png",
  "./assets/icon-180.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/map.jpg",
  "./assets/pdf-template.pdf",
  "./assets/sans-bold.ttf",
  "./assets/sans-regular.ttf",
  "./assets/source-arial-bold.ttf",
  "./assets/source-arial.ttf",
  "./index.html",
  "./js/app.js",
  "./js/catalog.js",
  "./js/legacy.js",
  "./js/model.js",
  "./js/pdf.js",
  "./js/storage.js",
  "./manifest.webmanifest",
  "./pwa-install.js",
  "./styles.css",
  "./vendor/fontkit.umd.min.js",
  "./vendor/pdf-lib.min.js"
];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES.map(path=>new Request(new URL(path,self.registration.scope),{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET'||!url.href.startsWith(self.registration.scope))return;
 event.respondWith(caches.open(CACHE).then(async cache=>{
  if(event.request.mode==='navigate'){
   try{const response=await fetch(event.request);if(response.ok)await cache.put(new URL('index.html',self.registration.scope).href,response.clone());return response;}catch{return cache.match(new URL('index.html',self.registration.scope).href);}
  }
  const plain=new URL(event.request.url);plain.search='';
  return (await cache.match(event.request))||(await cache.match(plain.href))||fetch(event.request);
 }));
});
