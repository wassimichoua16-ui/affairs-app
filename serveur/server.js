/* =====================================================================
   AFFAIR'S — Estimation en ligne par IA
   Serveur autonome (Node.js 18 ou plus récent, aucune installation npm)
   Lancement :  node server.js     puis ouvrir http://localhost:3000
   ===================================================================== */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");

const ROOT = __dirname;
const PUB = path.join(ROOT, "public");
const DATA = path.join(ROOT, "data");
fs.mkdirSync(DATA, { recursive: true });

const readTxt = f => { try { return fs.readFileSync(path.join(ROOT, f), "utf8").trim(); } catch { return ""; } };

/* ---------- Configuration ---------- */
const API_KEY = process.env.ANTHROPIC_API_KEY || readTxt("cle-api.txt").replace(/^COLLEZ.*$/i, "");
const MODEL_ID = process.env.MODELE_IDENTIFICATION || "claude-opus-5-5";   // identification photo (précision)
const MODEL_PRICE = process.env.MODELE_PRIX || "claude-sonnet-5-5";        // recherche des prix (rapide)
const PORT = Number(process.env.PORT) || 3000;
const GERANT_PWD = process.env.GERANT_PASSWORD || readTxt("mot-de-passe-gerant.txt") || "affairs2026";
const MODE_TEST = process.env.MODE_TEST === "1" || !API_KEY.startsWith("sk-");
let WEB_SEARCH = process.env.RECHERCHE_WEB !== "0";

const STORES = JSON.parse(fs.readFileSync(path.join(PUB, "magasins.json"), "utf8"));
const CATS = { telephone:"Téléphone", ordinateur:"Ordinateur", console:"Console", tv:"TV", photo:"Appareil photo", audio:"Audio",
  montre:"Montre connectée", drone:"Drone", tablette:"Tablette", jeux:"Jeux vidéo", autre:"Autre" };
const ETATS = { tres_bon:"Très bon état", bon:"Bon état", correct:"État correct", abime:"Abîmé / à réparer" };

/* ---------- Paramètres internes (jamais envoyés au client) ---------- */
const DEFAULT_PARAMS = {
  savPct: 3, oldYear: 2017, lowConfidenceCut: 10,
  refurb: { tres_bon: 0, bon: 10, correct: 30, abime: 60 },
  margins: { telephone:20, ordinateur:25, console:20, tv:30, photo:25, audio:30, montre:25, drone:25, tablette:22, jeux:40, autre:35 }
};
const PARAMS_FILE = path.join(DATA, "parametres.json");
const EST_FILE = path.join(DATA, "estimations.json");
function loadJSON(f, d){ try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } }
function saveJSON(f, v){ const tmp = f + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(v, null, 2)); fs.renameSync(tmp, f); }
let PARAMS = Object.assign(structuredClone(DEFAULT_PARAMS), loadJSON(PARAMS_FILE, {}));
let ESTIMATIONS = loadJSON(EST_FILE, []);

/* ---------- Outils ---------- */
const CORS = { "access-control-allow-origin":"*", "access-control-allow-methods":"GET,POST,PUT,PATCH,OPTIONS", "access-control-allow-headers":"content-type,authorization", "access-control-max-age":"86400" };
function send(res, code, obj){ const b = JSON.stringify(obj); res.writeHead(code, { "content-type":"application/json; charset=utf-8", "cache-control":"no-store", ...CORS }); res.end(b); }
function readBody(req, max = 30e6){
  return new Promise((ok, ko) => {
    let n = 0; const chunks = [];
    req.on("data", c => { n += c.length; if (n > max) { ko(Object.assign(new Error("Photos trop lourdes"), { status:413 })); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { ok(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); } catch { ko(Object.assign(new Error("Requête invalide"), { status:400 })); } });
    req.on("error", ko);
  });
}
const clean = (s, n = 200) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").slice(0, n).trim();
const hits = new Map();
function rateLimited(ip, limit = 40, windowMs = 3600e3){
  const now = Date.now(), arr = (hits.get(ip) || []).filter(t => now - t < windowMs);
  arr.push(now); hits.set(ip, arr); return arr.length > limit;
}
function parseJSON(t){
  try { return JSON.parse(t); } catch {}
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (m) { try { return JSON.parse(m[1]); } catch {} }
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  throw Object.assign(new Error("Réponse de l'IA illisible"), { code:"ai_format" });
}

/* ---------- Appel à l'API Claude ---------- */
async function callClaude({ model, content, tools, maxTokens = 2500 }){
  const messages = [{ role:"user", content }];
  let last;
  for (let round = 0; round < 4; round++){
    const body = { model, max_tokens: maxTokens, messages };
    if (tools) body.tools = tools;
    let r;
    try {
      r = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{ "content-type":"application/json", "x-api-key":API_KEY, "anthropic-version":"2023-06-01" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(180e3)
      });
    } catch (e) { throw Object.assign(new Error("Impossible de joindre l'IA (connexion Internet ?)"), { code:"ai_network" }); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok){
      const msg = j?.error?.message || ("Erreur " + r.status);
      const code = r.status === 401 ? "ai_key" : r.status === 429 ? "ai_busy" : r.status === 529 ? "ai_busy" : r.status === 400 && /credit|balance/i.test(msg) ? "ai_credit" : "ai_error";
      throw Object.assign(new Error(msg), { code, status:r.status });
    }
    last = j;
    if (j.stop_reason === "pause_turn"){ messages.push({ role:"assistant", content:j.content }); continue; }
    break;
  }
  const text = (last.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  const sources = [];
  for (const b of last.content || []){
    if (b.type === "web_search_tool_result" && Array.isArray(b.content))
      for (const r of b.content) if (r.url && !sources.find(s => s.url === r.url)) sources.push({ url:r.url, titre:r.title || r.url });
  }
  return { text, sources, usage:last.usage };
}

/* ---------- Étape 1 : identification sur photos ---------- */
async function identify(p){
  const cat = CATS[p.cat] ? p.cat : "autre";
  const imgs = (Array.isArray(p.images) ? p.images : []).slice(0, 6)
    .filter(i => /^image\/(jpeg|png|webp|gif)$/.test(i.media_type) && typeof i.data === "string" && i.data.length < 8e6);
  if (!imgs.length) throw Object.assign(new Error("Aucune photo exploitable"), { code:"no_photo", status:400 });
  const roles = (p.roles || []).slice(0, imgs.length).map(r => clean(r, 40));
  const acc = (p.accessoires || []).map(a => clean(a, 30)).filter(Boolean);
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `Tu es l'expert acheteur d'Affair's, magasin d'achat-revente d'occasion en France. Date du jour : ${today}.
Un particulier veut nous vendre un article. Analyse les ${imgs.length} photo(s) jointe(s) (dans l'ordre : ${roles.join(", ") || "non précisé"}).
Catégorie choisie par le client : ${CATS[cat]}. Modèle saisi par le client : ${clean(p.modele_saisi) || "non précisé"}. Accessoires apportés : ${acc.join(", ") || "aucun indiqué"}. État déclaré par le client : ${ETATS[p.etat_declare] || "non précisé"}.

IDENTIFICATION — procède en deux temps :
1) Dans "indices_visuels", liste d'abord UNIQUEMENT ce que tu vois réellement : logos et marques lisibles, inscriptions, texte des étiquettes, couleur, forme générale, matériaux, ports/boutons, grilles d'aération, nombre et disposition des objectifs photo.
2) Ensuite seulement, déduis le modèle À PARTIR DE CES INDICES. La catégorie choisie et le modèle saisi par le client sont de simples indications : ne t'en sers jamais pour deviner si les photos ne le confirment pas, et ne choisis jamais le modèle le plus courant « par défaut ».
Pièges fréquents : Xbox Series X (tour noire rectangulaire, dessus perforé à reflet vert) vs Series S (petite, blanche, grille ronde noire) vs PS5 (façades blanches incurvées, logo PlayStation) ; PS5 standard vs Slim vs Pro ; Switch vs Switch OLED vs Switch 2 ; générations d'iPhone (bloc photo, Dynamic Island, bouton Action, USB-C vs Lightning, plateau photo pleine largeur des iPhone 17 Pro) ; Pro vs Pro Max (taille) ; Galaxy S vs A ; montres et sacs de luxe potentiellement contrefaits.
Si un doute subsiste, confiance "moyenne" ou "faible" et liste les autres possibilités dans "alternatives". Ne devine pas une capacité non visible : écris « à confirmer ».

ÉTAT : "tres_bon", "bon", "correct" ou "abime", d'après les photos ; si le client déclare un état moins bon que ce que tu vois, retiens le sien. "remise" = coût estimé en euros de remise en état si des défauts sont visibles (écran fissuré, pièce manquante…), sinon 0.
Si les photos ne montrent pas un article revendable ou sont inexploitables : "article_valide": false et explique dans "raison_invalide".
Textes en français, courts, polis, destinés au client. Aucun prix dans les observations.

Réponds uniquement avec ce JSON :
{"indices_visuels":["..."],"article_valide":true,"cat":"telephone|ordinateur|console|tv|photo|audio|montre|drone|tablette|jeux|autre","marque":"","modele":"","variante":"capacité / configuration / couleur","annee":2023,"alternatives":[],"etat":"tres_bon|bon|correct|abime","confiance":"haute|moyenne|faible","observations":["3 à 5 constats"],"defauts":[],"remise":0,"photo_utile":"","raison_invalide":""}`;

  let d;
  if (MODE_TEST) d = mockIdentify(cat);
  else {
    const content = [...imgs.map(i => ({ type:"image", source:{ type:"base64", media_type:i.media_type, data:i.data } })), { type:"text", text:prompt }];
    d = parseJSON((await callClaude({ model:MODEL_ID, content, maxTokens:2000 })).text);
  }
  if (!d || d.article_valide === false) return { ok:false, code:"invalid_item", message:clean(d?.raison_invalide, 300) };
  const ident = {
    cat: CATS[d.cat] ? d.cat : cat, marque:clean(d.marque, 60), modele:clean(d.modele, 100), variante:clean(d.variante, 120),
    annee: Number(d.annee) || null, etat: ETATS[d.etat] ? d.etat : "bon",
    confiance: ["haute","moyenne","faible"].includes(d.confiance) ? d.confiance : "moyenne",
    indices: (d.indices_visuels || []).slice(0, 6).map(x => clean(x, 160)),
    alternatives: (d.alternatives || []).slice(0, 3).map(x => clean(x, 80)).filter(Boolean),
    observations: (d.observations || []).slice(0, 5).map(x => clean(x, 160)),
    defauts: (d.defauts || []).slice(0, 4).map(x => clean(x, 160)),
    remise: Math.max(0, Number(d.remise) || 0), photo_utile: clean(d.photo_utile, 160), accessoires: acc
  };
  ident.trop_ancien = ident.cat === "telephone" && ident.annee && ident.annee <= PARAMS.oldYear;
  const id = crypto.randomUUID();
  PENDING.set(id, { t:Date.now(), ident });
  return { ok:true, id, ident };
}

/* ---------- Étape 2 : prix du marché + calcul de reprise ---------- */
async function price(p){
  const pend = PENDING.get(p.id);
  if (!pend) throw Object.assign(new Error("Estimation expirée, recommencez."), { code:"expired", status:410 });
  const ident = pend.ident;
  if (p.correction){
    ident.corrige = true;
    ident.modele = clean(p.correction, 120); ident.marque = ""; ident.variante = clean(p.variante_corrigee, 120) || "à confirmer";
    ident.confiance = "haute";
    const y = Number(p.annee_corrigee); if (y) ident.annee = y;
  }
  const nom = [ident.marque, ident.modele, ident.variante].filter(Boolean).join(" ");
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `Tu es l'acheteur d'Affair's, magasin d'achat-revente d'occasion en France (Auvergne-Rhône-Alpes). Date du jour : ${today}.
Article : ${nom}${ident.corrige ? " (modèle confirmé par le client)" : ""}. Catégorie : ${CATS[ident.cat]}. État estimé : ${ETATS[ident.etat]}.
Défauts relevés : ${ident.defauts.join("; ") || "aucun"}. Accessoires : ${ident.accessoires.join(", ") || "aucun indiqué"}.

${WEB_SEARCH ? `Fais des recherches web sur le marché FRANÇAIS actuel : prix neuf actuel, prix reconditionné (Back Market, Rakuten, Fnac seconde vie…), prix d'occasion dans les magasins d'occasion (Easy Cash, Cash Converters…) et annonces entre particuliers. Les prix affichés ne sont pas des prix de vente réels : sois prudent.` : `Utilise tes connaissances du marché français de l'occasion.`}

Donne le prix de REVENTE réaliste et PRUDENT pour un magasin d'occasion français qui vend avec garantie, dans cet état : "rmin" = prix pour vendre vite, "rmax" = prix maximum raisonnable. Jamais le prix neuf.
Indique aussi l'année de sortie du modèle si tu la connais.

Réponds uniquement avec ce JSON :
{"prix_neuf":0,"prix_reconditionne":0,"prix_occasion_particuliers":"fourchette texte","rmin":0,"rmax":0,"annee":2023,"demande":"forte|moyenne|faible","commentaire":"1 à 2 phrases pour le gérant"}`;

  let d, sources = [];
  if (MODE_TEST) d = mockPrice(ident);
  else {
    const tools = WEB_SEARCH ? [{ type:"web_search_20250305", name:"web_search", max_uses:4, user_location:{ type:"approximate", country:"FR", timezone:"Europe/Paris" } }] : undefined;
    let r;
    try { r = await callClaude({ model:MODEL_PRICE, content:[{ type:"text", text:prompt }], tools, maxTokens:3000 }); }
    catch (e) {
      if (tools && e.status === 400 && /web.?search/i.test(e.message)) { WEB_SEARCH = false; console.log("Recherche web désactivée pour l'organisation : poursuite sans."); return price(p); }
      throw e;
    }
    d = parseJSON(r.text); sources = r.sources.slice(0, 8);
  }
  let rmin = Number(d.rmin) || 0, rmax = Number(d.rmax) || rmin;
  if (rmax < rmin) [rmin, rmax] = [rmax, rmin];
  if (!rmin) return { ok:false, code:"no_price" };
  if (!ident.annee && Number(d.annee)) ident.annee = Number(d.annee);
  if (ident.cat === "telephone" && ident.annee && ident.annee <= PARAMS.oldYear) return { ok:true, trop_ancien:true, ident:publicIdent(ident) };

  const calc = computeOffer(ident, rmin, rmax);
  if (calc.high <= 0) return { ok:false, code:"too_low" };
  pend.priced = { rmin, rmax, calc, marche:{ prix_neuf:Number(d.prix_neuf)||null, prix_reconditionne:Number(d.prix_reconditionne)||null, particuliers:clean(d.prix_occasion_particuliers,80), demande:clean(d.demande,20), commentaire:clean(d.commentaire,400) }, sources, t:Date.now() };
  return { ok:true, ident:publicIdent(ident), revente:{ min:rmin, max:rmax }, reprise:{ min:calc.low, max:calc.high } };
}
function publicIdent(i){ const { remise, ...rest } = i; return rest; }

function roundDown(v){ if (v <= 0) return 0; const step = v >= 100 ? 10 : v >= 20 ? 5 : 1; return Math.floor(v / step) * step; }
function computeOffer(ident, rmin, rmax){
  const margin = (PARAMS.margins[ident.cat] ?? PARAMS.margins.autre) / 100;
  const sav = PARAMS.savPct / 100;
  const refurb = Math.max(PARAMS.refurb[ident.etat] || 0, ident.remise || 0);
  const prudent = ident.confiance === "faible" ? PARAMS.lowConfidenceCut / 100 : 0;
  const one = r => { const base = r * (1 - prudent); return { revente:r, decote:+(r*prudent).toFixed(2), marge:+(base*margin).toFixed(2), sav:+(base*sav).toFixed(2), remise:refurb, brut:+(base*(1-margin-sav)-refurb).toFixed(2) }; };
  const lo = one(rmin), hi = one(rmax);
  return { lo, hi, low:roundDown(lo.brut), high:roundDown(hi.brut), margePct:margin*100, savPct:PARAMS.savPct };
}

/* ---------- Étape 3 : choix du magasin → enregistrement ---------- */
const PENDING = new Map();
setInterval(() => { const now = Date.now(); for (const [k, v] of PENDING) if (now - v.t > 6 * 3600e3) PENDING.delete(k); }, 600e3).unref();

function saveEstimate(p){
  const pend = PENDING.get(p.id);
  if (!pend || !pend.priced) throw Object.assign(new Error("Estimation expirée, recommencez."), { code:"expired", status:410 });
  const store = STORES.find(s => s.id === p.magasin);
  if (!store) throw Object.assign(new Error("Magasin inconnu"), { status:400 });
  if (clean(p.prenom, 40).length < 2) throw Object.assign(new Error("Prénom obligatoire"), { code:"prenom", status:400 });
  const now = new Date();
  let ref;
  do { ref = "EST-" + String(now.getDate()).padStart(2,"0") + String(now.getMonth()+1).padStart(2,"0") + "-" + crypto.randomBytes(3).toString("hex").toUpperCase().slice(0,4); }
  while (ESTIMATIONS.find(e => e.ref === ref));
  const i = pend.ident, pr = pend.priced;
  const thumb = typeof p.miniature === "string" && p.miniature.startsWith("data:image/jpeg;base64,") && p.miniature.length < 80000 ? p.miniature : null;
  const rec = {
    ref, date: now.toISOString(), valide_jusqu_au: new Date(now.getTime() + 7*864e5).toISOString(),
    magasin: store.id, statut: "nouvelle", prix_paye: null, note: "",
    article: { cat:i.cat, marque:i.marque, modele:i.modele, variante:i.variante, annee:i.annee, etat:i.etat, confiance:i.confiance, corrige:!!i.corrige,
      indices:i.indices, observations:i.observations, defauts:i.defauts, accessoires:i.accessoires },
    revente: { min:pr.rmin, max:pr.rmax }, reprise: { min:pr.calc.low, max:pr.calc.high }, calcul: pr.calc, marche: pr.marche, sources: pr.sources,
    client: { prenom: clean(p.prenom, 40), telephone: clean(p.telephone, 20) }, miniature: thumb
  };
  ESTIMATIONS.unshift(rec); saveJSON(EST_FILE, ESTIMATIONS);
  PENDING.delete(p.id);
  return { ok:true, ref, valide_jusqu_au: rec.valide_jusqu_au, magasin: store };
}

/* ---------- Espace gérant ---------- */
const SESSIONS = new Map();
function isGerant(req){ const t = (req.headers.authorization || "").replace(/^Bearer\s+/, ""); const s = SESSIONS.get(t); return s && Date.now() - s < 12*3600e3; }

/* ---------- Données de test (MODE_TEST, sans clé API) ---------- */
const MOCK = {
  telephone:{marque:"Apple",modele:"iPhone 17 Pro Max",variante:"256 Go · Orange cosmique",annee:2025,etat:"tres_bon",confiance:"haute",rmin:1049,rmax:1099,
    indices:["Plateau photo pleine largeur avec trois objectifs","Logo Apple au dos","Coloris orange","Port USB-C"],observations:["Modèle identifié","Écran en bon état","Châssis avec légères traces"],defauts:[]},
  console:{marque:"Microsoft",modele:"Xbox Series X",variante:"1 To",annee:2020,etat:"bon",confiance:"haute",rmin:300,rmax:340,
    indices:["Tour noire rectangulaire","Dessus perforé à reflet vert","Logo Xbox"],observations:["Modèle identifié","Coque sans rayure visible"],defauts:["Manette non visible sur les photos"]},
};
function mockIdentify(cat){
  const m = MOCK[cat] || { marque:"Produit", modele:"de test", variante:"MODE TEST", annee:2022, etat:"bon", confiance:"moyenne", indices:["Mode test : aucune analyse réelle"], observations:["Mode test"], defauts:[], rmin:200, rmax:240 };
  return { article_valide:true, cat, ...m, indices_visuels:m.indices, alternatives:[], remise:0, photo_utile:"" };
}
function mockPrice(ident){ const m = Object.values(MOCK).find(x => x.modele === ident.modele) || { rmin:200, rmax:240, annee:ident.annee }; return { rmin:m.rmin, rmax:m.rmax, annee:m.annee, prix_neuf:null, commentaire:"Mode test : prix fictifs." }; }

/* ---------- Serveur HTTP ---------- */
const MIME = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".json":"application/json; charset=utf-8", ".png":"image/png", ".svg":"image/svg+xml", ".ico":"image/x-icon" };
function serveStatic(req, res){
  let u = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (u === "/") u = "/index.html";
  if (u === "/gerant") u = "/gerant.html";
  const f = path.normalize(path.join(PUB, u));
  if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404, {"content-type":"text/plain; charset=utf-8"}); return res.end("Page introuvable"); }
  res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x"), p = url.pathname, ip = req.socket.remoteAddress;
  try {
    if (req.method === "OPTIONS"){ res.writeHead(204, CORS); return res.end(); }
    if (!p.startsWith("/api/")) return serveStatic(req, res);

    if (p === "/api/statut" && req.method === "GET")
      return send(res, 200, { mode: MODE_TEST ? "test" : "ia", recherche_web: WEB_SEARCH });

    if (p === "/api/identifier" && req.method === "POST"){
      if (rateLimited(ip)) return send(res, 429, { ok:false, code:"rate", message:"Trop d'estimations depuis cet appareil. Réessayez dans une heure." });
      return send(res, 200, await identify(await readBody(req)));
    }
    if (p === "/api/prix" && req.method === "POST") return send(res, 200, await price(await readBody(req, 1e5)));
    if (p === "/api/enregistrer" && req.method === "POST") return send(res, 200, saveEstimate(await readBody(req, 2e5)));

    if (p === "/api/gerant/connexion" && req.method === "POST"){
      const b = await readBody(req, 1e4);
      const a = Buffer.from(String(b.mot_de_passe || "")), g = Buffer.from(GERANT_PWD);
      if (a.length !== g.length || !crypto.timingSafeEqual(a, g)) { await new Promise(r => setTimeout(r, 800)); return send(res, 401, { ok:false, message:"Mot de passe incorrect" }); }
      const t = crypto.randomBytes(24).toString("hex"); SESSIONS.set(t, Date.now());
      return send(res, 200, { ok:true, jeton:t, mot_de_passe_par_defaut: GERANT_PWD === "affairs2026" });
    }
    if (p.startsWith("/api/gerant/")){
      if (!isGerant(req)) return send(res, 401, { ok:false, message:"Session expirée" });
      if (p === "/api/gerant/estimations" && req.method === "GET") return send(res, 200, { ok:true, estimations: ESTIMATIONS, magasins: STORES });
      if (p === "/api/gerant/parametres" && req.method === "GET") return send(res, 200, { ok:true, parametres: PARAMS, defauts: DEFAULT_PARAMS, mode: MODE_TEST ? "test" : "ia", recherche_web: WEB_SEARCH, modeles:{ identification:MODEL_ID, prix:MODEL_PRICE } });
      if (p === "/api/gerant/parametres" && req.method === "PUT"){
        const b = await readBody(req, 1e4), n = v => Math.max(0, Math.min(100000, Number(v) || 0));
        PARAMS = { savPct:n(b.savPct), oldYear:n(b.oldYear), lowConfidenceCut:n(b.lowConfidenceCut),
          refurb:Object.fromEntries(Object.keys(DEFAULT_PARAMS.refurb).map(k => [k, n(b.refurb?.[k])])),
          margins:Object.fromEntries(Object.keys(DEFAULT_PARAMS.margins).map(k => [k, Math.min(90, n(b.margins?.[k]))])) };
        saveJSON(PARAMS_FILE, PARAMS); return send(res, 200, { ok:true, parametres: PARAMS });
      }
      const m = p.match(/^\/api\/gerant\/estimations\/(EST-[\w-]+)$/);
      if (m && req.method === "PATCH"){
        const e = ESTIMATIONS.find(x => x.ref === m[1]); if (!e) return send(res, 404, { ok:false, message:"Numéro introuvable" });
        const b = await readBody(req, 1e4);
        if (["nouvelle","achetee","refusee","sans_suite"].includes(b.statut)) e.statut = b.statut;
        if ("prix_paye" in b) e.prix_paye = b.prix_paye === "" || b.prix_paye == null ? null : Number(b.prix_paye);
        if ("note" in b) e.note = clean(b.note, 500);
        saveJSON(EST_FILE, ESTIMATIONS); return send(res, 200, { ok:true, estimation:e });
      }
    }
    send(res, 404, { ok:false, message:"Introuvable" });
  } catch (e) {
    console.error("[" + new Date().toLocaleTimeString("fr-FR") + "]", e.code || "", e.message);
    send(res, e.status && e.status < 500 && !String(e.code||"").startsWith("ai_") ? e.status : 200, { ok:false, code:e.code || "server", message:e.message });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  const lan = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === "IPv4" && !i.internal)?.address;
  console.log("\n  AFFAIR'S — Estimation en ligne");
  console.log("  ─────────────────────────────────────────");
  console.log(`  Sur cet ordinateur :   http://localhost:${PORT}`);
  if (lan) console.log(`  Sur votre téléphone :  http://${lan}:${PORT}   (même Wi-Fi)`);
  console.log(`  Espace gérant :        http://localhost:${PORT}/gerant`);
  console.log(MODE_TEST ? "\n  ⚠  MODE TEST : aucune clé API trouvée → résultats fictifs.\n     Collez votre clé dans le fichier cle-api.txt puis relancez."
                        : `\n  ✓ IA active (identification : ${MODEL_ID}, prix : ${MODEL_PRICE}, recherche web : ${WEB_SEARCH ? "oui" : "non"})`);
  if (GERANT_PWD === "affairs2026") console.log("  ⚠  Mot de passe gérant par défaut : affairs2026 (changez-le dans mot-de-passe-gerant.txt)");
  console.log("\n  Laissez cette fenêtre ouverte pendant l'utilisation.\n");
});
