// Solo per chi modifica i sorgenti. Il sito distribuito funziona senza Node o npm.
import { createRequire } from "node:module";
const { build } = createRequire(import.meta.url)("esbuild");
import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assets = JSON.parse(
  await readFile(resolve(root, "assets/beni.json"), "utf8"),
);
await writeFile(
  resolve(root, "js/catalog.js"),
  "/** Generato da assets/beni.json. */\nexport const ASSETS = " +
    JSON.stringify(assets, null, 2) +
    ";\n",
);
await build({
  entryPoints: [resolve(root, "js/app.js")],
  bundle: true,
  format: "iife",
  target: ["chrome90", "safari15", "firefox90"],
  outfile: resolve(root, "app.bundle.js"),
  minify: false,
  banner: {
    js: "/* Schede Restauro 2.0 — generato dai sorgenti modulari in js/. */",
  },
});
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (["tools", "node_modules"].includes(entry.name)) continue;
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (
      !["sw.js", ".nojekyll", "package.json", "package-lock.json"].includes(
        entry.name,
      ) &&
      !entry.name.endsWith(".md") &&
      !entry.name.endsWith(".txt")
    )
      files.push("./" + relative(root, path).replaceAll("\\", "/"));
  }
}
await walk(root);
files.sort();
const sw = `/* Cache isolata per il percorso della PWA. */
const VERSION='2.0.0';
const PREFIX='schede-restauro:'+self.registration.scope+':';
const CACHE=PREFIX+VERSION;
const FILES=${JSON.stringify(["./", ...files], null, 2)};
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
});\n`;
await writeFile(resolve(root, "sw.js"), sw);
console.log("Bundle e cache aggiornati.");
