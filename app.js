// Create Your Own Trip — website app.
// Screens: home (inspiration), wizard (the questions), trip (use the plan).
import {INTERESTS, PACE, STAY, GEMS, MAX_NIGHTS, nightsOf, travellersText, cleanAnswers, chatPrompt, validatePlan} from "./plan.js";

// ===== SITE CONFIG =====
const CONFIG = {
  apiUrl: "",              // the planning server (Cloudflare Worker), e.g. "https://plan.example.workers.dev". Empty = demo mode.
  turnstileSiteKey: "",    // Cloudflare Turnstile site key for the "not a robot" check. Empty = no check.
  siteName: "Create Your Own Trip"
};
const OSRM = "https://router.project-osrm.org/route/v1/driving/";
const TYPES = {event:"Event", hotel:"Base", poi:"Place", other:"Travel"};

// ---------- helpers ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const toD = s => { const [y,m,d] = s.split("-").map(Number); return new Date(Date.UTC(y,m-1,d)); };
const fromD = d => d.toISOString().slice(0,10);
const addDays = (s,n) => { const d = toD(s); d.setUTCDate(d.getUTCDate()+n); return fromD(d); };
const fmtDay = s => toD(s).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short",timeZone:"UTC"});
const fmtShort = s => toD(s).toLocaleDateString("en-GB",{day:"numeric",month:"short",timeZone:"UTC"});
const fmtLong = s => toD(s).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"});
const hasLoc = it => it && it.lat != null && it.lng != null && it.lat !== "" && Number.isFinite(+it.lat) && Number.isFinite(+it.lng);
const ll = it => `${(+it.lat).toFixed(6)},${(+it.lng).toFixed(6)}`;
const todayISO = () => new Date().toLocaleDateString("en-CA");
function haversine(a,b){ const R=6371,r=x=>x*Math.PI/180,dLat=r(b.lat-a.lat),dLng=r(b.lng-a.lng); const h=Math.sin(dLat/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLng/2)**2; return 2*R*Math.asin(Math.sqrt(h)); }
function estimate(a,b){ const km = haversine({lat:+a.lat,lng:+a.lng},{lat:+b.lat,lng:+b.lng})*1.35; return {km, h:km/65, est:true}; }
const fmtKm = km => km < 10 ? km.toFixed(1)+" km" : Math.round(km).toLocaleString("en-GB")+" km";
function fmtH(h){ const m=Math.round(h*60); if (m<60) return m+" min"; const hh=Math.floor(m/60), mm=m%60; return hh+" h"+(mm?" "+String(mm).padStart(2,"0")+" min":""); }
function toast(msg){ const t=$("#toast"); t.textContent=msg; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true,2600); }
const store = {
  get(k, d){ try{ const v = localStorage.getItem("cyo_"+k); return v==null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem("cyo_"+k, JSON.stringify(v)); return true; }catch(e){ return false; } },
  del(k){ try{ localStorage.removeItem("cyo_"+k); }catch(e){} }
};
function hash(s){ let h=2166136261; for (const c of String(s)) { h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return h>>>0; }
function rng(seed){ let x = seed || 1; return () => { x ^= x<<13; x ^= x>>>17; x ^= x<<5; return ((x>>>0)%10000)/10000; }; }

// ---------- landscape art (no photos needed) ----------
const PALETTES = [
  {sky:["#2c4a6e","#8fa9c0"], hills:["#3e5c55","#24392f"], sun:"#e8eef2"},
  {sky:["#d98a4e","#f4d6a0"], hills:["#b0703f","#7c4a2b"], sun:"#fff3d6"},
  {sky:["#3a6ea5","#f0b47a"], hills:["#6b5a7a","#3b324a"], sun:"#ffe9c4"},
  {sky:["#1f4e5f","#9fd3c7"], hills:["#2f6f62","#174238"], sun:"#f2fff9"},
  {sky:["#5b3f8c","#f19c79"], hills:["#7c4d7a","#3e2a4f"], sun:"#ffe3c9"},
  {sky:["#1d3557","#a8dadc"], hills:["#457b9d","#1d3557"], sun:"#f1faee"}
];
function artFor(seedText, art){
  const p = art || PALETTES[hash(seedText) % PALETTES.length], r = rng(hash(seedText)+7), id = "g"+(hash(seedText)%100000);
  const ridge = (base, amp, steps) => { let d = `M0 ${base}`; for (let k=1;k<=steps;k++){ const x = k*1600/steps, y = base - r()*amp; d += ` L${x.toFixed(0)} ${y.toFixed(0)}`; } return d + " L1600 900 L0 900Z"; };
  const sx = 900 + r()*500, sy = 260 + r()*120;
  return `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.sky[0]}"/><stop offset="1" stop-color="${p.sky[1]}"/></linearGradient></defs>
    <rect width="1600" height="900" fill="url(#${id})"/><circle cx="${sx.toFixed(0)}" cy="${sy.toFixed(0)}" r="70" fill="${p.sun}" opacity=".85"/>
    <path d="${ridge(560,260,9)}" fill="${p.hills[0]}" opacity=".9"/><path d="${ridge(700,180,7)}" fill="${p.hills[1]}"/>
    <path d="M520 900 C640 800 760 760 900 720 S1180 660 1300 640" stroke="${p.sun}" stroke-width="7" fill="none" stroke-dasharray="34 26" opacity=".7"/></svg>`;
}

// ---------- places that suit each month (for "Surprise me" and the season hint) ----------
const DESTS = [
  ["Scottish Highlands","United Kingdom",[5,6,7,8,9],"Lochs, glens, castles and the Isle of Skye"],
  ["Iceland Ring Road","Iceland",[6,7,8],"Waterfalls, glaciers and black beaches in the midnight sun"],
  ["Norway's fjords","Norway",[6,7,8],"Fjords, ferries and mountain roads"],
  ["Dolomites","Italy",[6,7,8,9],"Jagged peaks, high passes and alpine huts"],
  ["Tuscany","Italy",[4,5,6,9,10],"Hill towns, cypress roads and wine"],
  ["Sicily","Italy",[4,5,6,9,10],"Baroque towns, Etna and the sea"],
  ["Provence","France",[5,6,9],"Lavender, markets and Roman towns"],
  ["Corsica","France",[5,6,9],"Mountains that drop into turquoise bays"],
  ["Andalusia","Spain",[3,4,5,10,11],"White villages and Moorish cities"],
  ["Basque Country & Picos de Europa","Spain",[5,6,7,8,9],"Green coast, food and limestone peaks"],
  ["Portugal, Lisbon to the Algarve","Portugal",[4,5,6,9,10],"Cliffs, beaches and tiled towns"],
  ["Croatian coast","Croatia",[5,6,9],"Islands, old towns and waterfalls"],
  ["Slovenia","Slovenia",[5,6,7,8,9],"Alpine lakes, caves and a tiny coast"],
  ["Ireland's Wild Atlantic Way","Ireland",[5,6,7,8,9],"Cliffs, pubs and empty beaches"],
  ["Swiss Alps","Switzerland",[6,7,8,9],"Passes, glaciers and lake towns"],
  ["Salzkammergut & Tyrol","Austria",[5,6,7,8,9,10],"Lakes, mountains and alpine villages"],
  ["Bavaria & the Black Forest","Germany",[5,6,7,8,9,10],"Castles, forests and old towns"],
  ["Crete","Greece",[4,5,6,9,10],"Gorges, beaches and village tavernas"],
  ["California's Pacific Coast","United States",[4,5,6,7,8,9,10],"Big Sur, redwoods and coastal towns"],
  ["Utah's national parks","United States",[4,5,9,10],"Red-rock canyons and arches"],
  ["Canadian Rockies","Canada",[6,7,8,9],"Turquoise lakes and the Icefields Parkway"],
  ["New Zealand's South Island","New Zealand",[11,12,1,2,3],"Fjords, lakes and mountain roads"],
  ["Tasmania","Australia",[11,12,1,2,3,4],"Wild coasts and wildlife"],
  ["Chilean Patagonia (Carretera Austral)","Chile",[12,1,2,3],"Glaciers, rainforest and marble caves"],
  ["Central Chile","Chile",[10,11,12,1,2,3,4],"Wine valleys, the Andes and the Pacific"],
  ["Atacama & northern Chile","Chile",[3,4,5,9,10,11],"Deserts, salt flats and the clearest skies"],
  ["Morocco, Atlas to the Sahara","Morocco",[3,4,5,10,11],"Kasbahs, mountain roads and dunes"],
  ["Namibia","Namibia",[5,6,7,8,9,10],"Red dunes, desert wildlife and huge skies"],
  ["South Africa's Garden Route","South Africa",[10,11,12,1,2,3,4],"Coast, forests and wine country"],
  ["Hokkaido","Japan",[6,7,8,9],"Volcanoes, flower fields and hot springs"],
  ["Costa Rica","Costa Rica",[12,1,2,3,4],"Rainforest, volcanoes and beaches"],
  ["Oman","Oman",[11,12,1,2,3],"Wadis, forts and desert roads"]
];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function monthsText(ms){   // [3,4,5,10,11] -> "Mar–May and Oct–Nov" (wraps over the new year)
  const set = new Set(ms), runs = []; let start = [...Array(12).keys()].map(k=>k+1).find(m=>set.has(m) && !set.has(m===1?12:m-1));
  if (!start) return "all year";
  for (let k=0, m=start, run=null; k<12; k++, m = m%12+1){ if (set.has(m)){ if (!run){ run=[m,m]; runs.push(run); } else run[1]=m; } else run=null; }
  const n = m => MONTHS[m-1].slice(0,3);
  return runs.map(([a,b]) => a===b ? n(a) : `${n(a)}–${n(b)}`).join(" and ");
}
function seasonHint(dest, start){
  if (!dest || !start) return "";
  const q = dest.toLowerCase(), m = toD(start).getUTCMonth()+1;
  const d = DESTS.find(([n,c]) => q.includes(n.toLowerCase().split(/[ ,(']/)[0]) || n.toLowerCase().includes(q));
  if (!d || d[2].includes(m)) return "";
  return `Heads-up: ${d[0]} is usually best in ${monthsText(d[2])}. ${MONTHS[m-1]} can still work; the plan will say what to expect.`;
}

// =====================================================================
// HOME
// =====================================================================
let samples = [];
async function loadSamples(){
  if (samples.length) return samples;
  try{ const r = await fetch("data/samples/index.json", {cache:"no-cache"}); samples = await r.json(); }catch(e){ samples = []; }
  return samples;
}
function cardHTML(s){
  return `<a class="card" href="#trip/${esc(s.id)}"><div class="card-art">${artFor(s.id, s.art)}<span class="badge">${s.nights} nights</span></div>
    <div class="card-body"><span class="card-dest">${esc(s.dest)}</span><h3>${esc(s.title)}</h3><p>${esc(s.summary)}</p>
    <div class="card-meta"><span><b>${s.stages}</b> bases</span><span><b>${s.places}</b> places</span>${s.gems?`<span class="gem-tag">◆ ${s.gems} hidden gems</span>`:""}<span>${esc(s.month)}</span></div></div></a>`;
}
let surpriseMonth = (new Date().getMonth() + 3) % 12 + 1, surpriseSeed = Date.now();
function surpriseHTML(){
  const list = DESTS.filter(d => d[2].includes(surpriseMonth));
  const r = rng(surpriseSeed % 100000 + 1), pick = [...list].sort(() => r() - .5).slice(0,6);
  return `<div class="surprise"><div class="surprise-bar"><label>Travel month<select id="sMonth">${MONTHS.map((m,k)=>`<option value="${k+1}"${k+1===surpriseMonth?" selected":""}>${m}</option>`).join("")}</select></label>
    <button class="btn" id="sShuffle" type="button">Shuffle ideas</button></div>
    <div class="ideas-grid">${pick.map(d=>`<button class="idea" type="button" data-dest="${esc(d[0])}" data-month="${surpriseMonth}"><b>${esc(d[0])}</b><span>${esc(d[3])}</span><em>Plan this trip →</em></button>`).join("")}</div></div>`;
}
function mineHTML(){
  const list = store.get("trips", []);
  if (!list.length) return "";
  return `<section class="block wrap" id="mine"><p class="kicker">Your trips</p><h2 class="h-sec">Saved on this device</h2><p class="lede">Trips you created or saved. They stay in this browser only.</p>
    <div class="mine">${list.map(t=>`<div class="mine-row"><a href="#trip/${esc(t.id)}">${esc(t.title)}</a><span>${esc(t.dest||"")} · ${t.start?esc(fmtShort(t.start)):""}</span><button type="button" data-del="${esc(t.id)}" aria-label="Remove ${esc(t.title)}">Remove</button></div>`).join("")}</div></section>`;
}
async function showHome(){
  setScreen("home");
  document.title = CONFIG.siteName + " — road trips planned around you";
  await loadSamples();
  $("#home").innerHTML = `
  <section class="hero"><div class="hero-art">${artFor("hero-home", PALETTES[2])}</div><div class="wrap">
    <p class="kicker" style="color:#ffd9b8">Road trips, planned around you</p>
    <h1>Answer a few questions. Get a trip you can drive.</h1>
    <p>Tell us where, when and what you love. You get a day-by-day route with places to see, where to sleep, drive times and a checklist, ready to use as it is or as a starting point.</p>
    <div class="ctas"><a class="btn primary big" href="#plan">Plan my trip</a><a class="btn ghost big" href="#inspire">Inspire me first</a></div>
    <p class="hero-note">Free to try. Plans are suggestions: check details before you book.</p></div></section>

  <section class="block wrap" id="samples"><p class="kicker">Inspiration</p><h2 class="h-sec">Trips to explore</h2>
    <p class="lede">Open one to see exactly what you get: the route, the map, where to stay and the practical extras.</p>
    <div class="cards">${samples.map(cardHTML).join("") || `<p class="note">Sample trips couldn't be loaded.</p>`}</div></section>

  <section class="block wrap" id="inspire"><p class="kicker">Surprise me</p><h2 class="h-sec">Not sure where to go?</h2>
    <p class="lede">Pick a month and get ideas that are at their best then. One click starts the planner with it.</p><div id="surpriseBox">${surpriseHTML()}</div></section>

  ${mineHTML()}

  <section class="block wrap" id="how"><p class="kicker">How it works</p><h2 class="h-sec">From a few answers to a plan you can drive</h2>
    <div class="steps3">
      <div class="step3"><h3>Answer 8 questions</h3><p>Where, when, who, your pace, what you enjoy, how you like to stay, and how far off the beaten path you want to go.</p></div>
      <div class="step3"><h3>Get your route</h3><p>Bases for each night, a plan for every day, drive times, hidden gems with a reason why, and the season check.</p></div>
      <div class="step3"><h3>Use it</h3><p>Navigate each drive with Google Maps, Waze or Apple Maps, search stays on Booking.com, tick off the checklist, print it or share it.</p></div>
    </div></section>

  <section class="block wrap" id="about">${disclaimerHTML(true)}</section>`;
}
function disclaimerHTML(full){
  return `<div class="disclaimer" id="disclaimer"><h3>Please read: these plans are suggestions</h3>
    <p style="margin:0">Trips are created automatically with AI (Claude by Anthropic) from your answers. They are inspiration and a starting point, not a booking, not professional travel advice and not a guarantee.</p>
    ${full ? `<ul>
      <li>Check opening times, prices, tickets, road and weather conditions, ferries and seasonal closures before you go. Information can be out of date or wrong.</li>
      <li>Check entry, visa, health and driving-licence rules for your nationality with official sources.</li>
      <li>Drive times are estimates. Drive safely and follow local rules; never plan to drive tired.</li>
      <li>Hotel buttons open Booking.com searches. We don't book anything, and prices and availability are set there.</li>
      <li>Use the plan at your own risk. We accept no liability for its accuracy or for decisions based on it.</li></ul>` : ""}</div>`;
}

// =====================================================================
// WIZARD
// =====================================================================
const WIZ_STEPS = ["where","when","who","pace","interests","stay","gems","extras","review"];
const wiz = {step:0, a:null, busy:false, err:"", ctl:null, token:""};
function wizDefaults(pre){ return {dest:"", from:"", start:"", end:"", adults:2, ages:[], pace:"balanced", interests:[], stay:"value", gems:1, wishes:"", title:"", ...(pre||{})}; }
function showWizard(params){
  setScreen("wizard");
  document.title = "Plan your trip — " + CONFIG.siteName;
  if (!wiz.a || params.get("new")){ wiz.a = wizDefaults(); wiz.step = 0; }
  const dest = params.get("dest"); if (dest){ wiz.a = wizDefaults({dest}); wiz.step = 0; }
  const month = +params.get("month");
  if (month && !wiz.a.start){ const now = new Date(); let y = now.getFullYear(); if (month < now.getMonth()+1 || (month===now.getMonth()+1)) y++; const s = `${y}-${String(month).padStart(2,"0")}-10`; wiz.a.start = s; wiz.a.end = addDays(s, 7); }
  wiz.err = ""; renderWizard();
}
function wizOpt(group, o, cur){ return `<button type="button" class="wiz-opt" data-pick="${group}" data-v="${o.v}" aria-pressed="${String(cur)===String(o.v)}"><i></i><span><b>${esc(o.t)}</b><span>${esc(o.d)}</span></span></button>`; }
function wizStepHTML(){
  const a = wiz.a, s = WIZ_STEPS[wiz.step];
  if (s==="where") return `<h2 class="wiz-q">Where would you like to go?</h2>
    <p class="wiz-sub">A country, a region or a route. We plan a road trip around it.</p>
    <div class="wiz-field"><label for="wDest">Destination</label><input type="text" id="wDest" class="wiz-big" autocomplete="off" maxlength="120" placeholder="e.g. Norway's fjords" value="${esc(a.dest)}"></div>
    <div class="wiz-ex">${["Scottish Highlands","Southern Norway","Andalusia","New Zealand's South Island","Iceland Ring Road","Central Chile"].map(x=>`<button type="button" data-ex="${esc(x)}">${esc(x)}</button>`).join("")}</div>
    <div class="wiz-field" style="margin-top:22px"><label for="wFrom">Start and end point <span style="text-transform:none;font-weight:400">(optional)</span></label><input type="text" id="wFrom" autocomplete="off" maxlength="120" placeholder="e.g. Bergen airport — leave empty and we pick one" value="${esc(a.from)}"></div>`;
  if (s==="when"){ const n = nightsOf(a), hint = seasonHint(a.dest, a.start);
    return `<h2 class="wiz-q">When are you travelling?</h2><p class="wiz-sub">The first day is your arrival, the last day your departure.</p>
    <div class="wiz-row"><div class="wiz-field"><label for="wStart">First day</label><input type="date" id="wStart" min="${todayISO()}" value="${esc(a.start)}"></div>
    <div class="wiz-field"><label for="wEnd">Last day</label><input type="date" id="wEnd" value="${esc(a.end)}" ${a.start?`min="${esc(addDays(a.start,1))}"`:""}></div></div>
    <p class="wiz-note" id="wNights">${n ? `${n} night${n>1?"s":""} · ${n+1} days` : "Pick both dates"}</p><p class="wiz-note warn" id="wSeason">${esc(hint)}</p>`; }
  if (s==="who") return `<h2 class="wiz-q">Who's coming along?</h2><p class="wiz-sub">Used for the plan and the hotel searches.</p>
    <div class="wiz-count"><div><b>Adults</b><span>18 and over</span></div><div class="wiz-step-ctl"><button type="button" data-cnt="adults" data-d="-1" aria-label="Fewer adults">−</button><output>${a.adults}</output><button type="button" data-cnt="adults" data-d="1" aria-label="More adults">+</button></div></div>
    <div class="wiz-count"><div><b>Children</b><span>Under 18</span></div><div class="wiz-step-ctl"><button type="button" data-cnt="kids" data-d="-1" aria-label="Fewer children">−</button><output>${a.ages.length}</output><button type="button" data-cnt="kids" data-d="1" aria-label="More children">+</button></div></div>
    ${a.ages.length ? `<span class="wiz-label" style="margin-top:14px">Children's ages</span><div class="wiz-ages">${a.ages.map((g,k)=>`<label>Child ${k+1}<input type="number" min="0" max="17" data-age="${k}" value="${esc(g)}"></label>`).join("")}</div>` : ""}`;
  if (s==="pace") return `<h2 class="wiz-q">What pace suits you?</h2><p class="wiz-sub">This sets how long the driving days get.</p><div class="wiz-opts">${PACE.map(o=>wizOpt("pace",o,a.pace)).join("")}</div>`;
  if (s==="interests") return `<h2 class="wiz-q">What do you enjoy?</h2><p class="wiz-sub">Pick as many as you like.</p>
    <div class="wiz-chips">${INTERESTS.map(x=>`<button type="button" class="wiz-chip" data-int="${esc(x)}" aria-pressed="${a.interests.includes(x)}">${esc(x)}</button>`).join("")}</div>`;
  if (s==="stay") return `<h2 class="wiz-q">Where do you like to stay?</h2><p class="wiz-sub">We suggest where to sleep and link to matching Booking.com searches.</p><div class="wiz-opts">${STAY.map(o=>wizOpt("stay",o,a.stay)).join("")}</div>`;
  if (s==="gems") return `<h2 class="wiz-q">Famous sights or hidden gems?</h2><p class="wiz-sub">Lesser-known places come with a reason why they're worth the detour.</p><div class="wiz-opts">${GEMS.map(o=>wizOpt("gems",o,a.gems)).join("")}</div>`;
  if (s==="extras") return `<h2 class="wiz-q">Anything else?</h2><p class="wiz-sub">All optional. The more you say, the better the plan fits.</p>
    <div class="wiz-field"><label for="wWish">Must-sees, wishes, things to avoid</label><textarea id="wWish" maxlength="600" placeholder="e.g. One glacier hike, no ferries over an hour, a rest day in the middle">${esc(a.wishes)}</textarea></div>
    <div class="wiz-field"><label for="wTitle">Trip name</label><input type="text" id="wTitle" maxlength="60" autocomplete="off" placeholder="Leave empty and we suggest one" value="${esc(a.title)}"></div>`;
  if (s==="review"){ const n = nightsOf(a), row=(k,v,st)=>`<div><dt>${k}</dt><dd>${v}</dd><button type="button" data-go="${st}">Edit</button></div>`;
    return `<h2 class="wiz-q">Ready to plan your trip?</h2><p class="wiz-sub">We build a day-by-day route with places to see and where to sleep. This takes one to three minutes.</p>
    <dl class="wiz-sum">
      ${row("Destination", esc(a.dest) + (a.from?`<br><span style="color:var(--muted)">from ${esc(a.from)}</span>`:""), 0)}
      ${row("Dates", `${fmtDay(a.start)} – ${fmtDay(a.end)} ${toD(a.end).getUTCFullYear()} · ${n} nights`, 1)}
      ${row("Travellers", esc(travellersText(a)), 2)}
      ${row("Pace", esc(PACE.find(p=>p.v===a.pace).t), 3)}
      ${row("Interests", a.interests.length?esc(a.interests.join(", ")):"<em>Anything goes</em>", 4)}
      ${row("Stays", esc(STAY.find(p=>p.v===a.stay).t), 5)}
      ${row("Style", esc(GEMS.find(p=>p.v===a.gems).t), 6)}
      ${row("Extras", esc([a.wishes, a.title&&("Name: "+a.title)].filter(Boolean).join(" · ")) || "<em>None</em>", 7)}
    </dl>
    <p class="wiz-note">By creating a trip you accept that it is an AI-made suggestion. <a href="#about">Read the disclaimer</a>.</p>
    ${CONFIG.apiUrl && CONFIG.turnstileSiteKey ? `<div id="tsBox" style="margin-top:14px"></div>` : ""}`;
  }
  return "";
}
function renderWizard(){
  const w = $("#wizard"); if (wiz.busy) return;
  const last = WIZ_STEPS.length-1, pct = Math.round((wiz.step+1)/WIZ_STEPS.length*100);
  w.innerHTML = `<div class="wiz-shell">
    <div class="wiz-top"><span class="wiz-bar"><i style="width:${pct}%"></i></span><span class="wiz-step">${wiz.step+1} / ${WIZ_STEPS.length}</span></div>
    <form class="wiz-body" id="wForm" novalidate>${wizStepHTML()}<p class="wiz-err" id="wErr" role="alert">${esc(wiz.err)}</p></form>
    <div class="wiz-nav">${wiz.step>0?`<button type="button" class="btn ghost big" id="wBack">Back</button>`:`<a class="btn ghost big" href="#">Cancel</a>`}<span class="spacer"></span>
      ${wiz.step<last ? `<button type="button" class="btn primary big" id="wNext">Next</button>` : `<button type="button" class="btn primary big" id="wGo">Create my trip</button>`}</div></div>`;
  const f = w.querySelector("input,textarea"); if (f && matchMedia("(pointer:fine)").matches) setTimeout(()=>f.focus(),30);
  window.scrollTo({top:0});
  if (WIZ_STEPS[wiz.step]==="review") mountTurnstile();
}
function wizRead(){
  const a = wiz.a, v = id => { const el = document.getElementById(id); return el ? el.value.trim() : null; };
  const s = WIZ_STEPS[wiz.step];
  if (s==="where"){ a.dest = v("wDest"); a.from = v("wFrom"); }
  if (s==="when"){ a.start = v("wStart"); a.end = v("wEnd"); }
  if (s==="who") document.querySelectorAll("[data-age]").forEach(el=>{ a.ages[+el.dataset.age] = Math.max(0,Math.min(17, Math.round(+el.value||0))); });
  if (s==="extras"){ a.wishes = v("wWish"); a.title = v("wTitle"); }
}
function wizCheck(){
  const a = wiz.a, s = WIZ_STEPS[wiz.step];
  if (s==="where" && a.dest.length<2) return "Tell us where you'd like to go.";
  if (s==="when"){
    if (!a.start || !a.end) return "Pick the first and the last day.";
    if (a.start < todayISO()) return "The first day is in the past.";
    const n = nightsOf(a);
    if (n<1) return "The last day has to be after the first day.";
    if (n>MAX_NIGHTS) return `Trips of up to ${MAX_NIGHTS} nights work best. Pick a shorter trip.`;
  }
  return "";
}
function wizNext(){ wizRead(); const e = wizCheck(); wiz.err = e; if (e){ $("#wErr").textContent = e; return; } wiz.step = Math.min(WIZ_STEPS.length-1, wiz.step+1); renderWizard(); }
document.addEventListener("click", e=>{
  const w = e.target.closest("#wizard"); if (!w || wiz.busy) return;
  const t = e.target;
  if (t.closest("#wNext")) return wizNext();
  if (t.closest("#wBack")){ wizRead(); wiz.err=""; wiz.step=Math.max(0,wiz.step-1); return renderWizard(); }
  if (t.closest("#wGo")) return generate();
  const ex = t.closest("[data-ex]"); if (ex){ $("#wDest").value = ex.dataset.ex; return; }
  const go = t.closest("[data-go]"); if (go){ wiz.step = +go.dataset.go; wiz.err=""; return renderWizard(); }
  const pk = t.closest("[data-pick]"); if (pk){ const g = pk.dataset.pick; wiz.a[g] = g==="gems" ? +pk.dataset.v : pk.dataset.v; return renderWizard(); }
  const ch = t.closest("[data-int]"); if (ch){ const x = ch.dataset.int, l = wiz.a.interests, k = l.indexOf(x); if (k<0) l.push(x); else l.splice(k,1); ch.setAttribute("aria-pressed", k<0); return; }
  const cn = t.closest("[data-cnt]"); if (cn){ wizRead(); const d = +cn.dataset.d;
    if (cn.dataset.cnt==="adults") wiz.a.adults = Math.max(1, Math.min(10, wiz.a.adults + d));
    else if (d>0 && wiz.a.ages.length<8) wiz.a.ages.push(8); else if (d<0) wiz.a.ages.pop();
    return renderWizard(); }
});
document.addEventListener("change", e=>{
  if (e.target.id==="wStart" || e.target.id==="wEnd"){ wizRead(); const a=wiz.a;
    if (e.target.id==="wStart" && a.start && (!a.end || a.end<=a.start)){ a.end = addDays(a.start, 7); $("#wEnd").value = a.end; }
    if (a.start) $("#wEnd").min = addDays(a.start,1);
    const n = nightsOf(a); $("#wNights").textContent = n ? `${n} night${n>1?"s":""} · ${n+1} days` : "Pick both dates";
    $("#wSeason").textContent = seasonHint(a.dest, a.start); }
});
document.addEventListener("keydown", e=>{
  if ($("#wizard").hidden || wiz.busy || e.key!=="Enter" || e.target.tagName==="TEXTAREA" || e.target.tagName==="BUTTON" || e.target.tagName==="A") return;
  if (e.target.closest && e.target.closest("#wizard")){ e.preventDefault(); if (wiz.step < WIZ_STEPS.length-1) wizNext(); }
});

// ----- the "not a robot" check (Cloudflare Turnstile) -----
function mountTurnstile(){
  if (!CONFIG.apiUrl || !CONFIG.turnstileSiteKey) return;
  const box = $("#tsBox"); if (!box) return;
  const go = () => { try{ window.turnstile.render(box, {sitekey: CONFIG.turnstileSiteKey, callback: t => { wiz.token = t; }, "expired-callback": () => { wiz.token = ""; }}); }catch(e){} };
  if (window.turnstile) return go();
  if (!document.getElementById("tsScript")){ const s = document.createElement("script"); s.id = "tsScript"; s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; s.async = true; s.onload = go; document.head.appendChild(s); }
  else document.getElementById("tsScript").addEventListener("load", go, {once:true});
}

// ----- create the trip -----
function makeScreen(steps, on, live){
  $("#wizard").innerHTML = `<div class="wiz-shell"><div class="wiz-make"><h2 class="wiz-q">Planning ${esc(wiz.a.dest)}…</h2><div class="wiz-road"><i></i></div>
    <ol class="wiz-steps">${steps.map((s,k)=>`<li class="${k<on?"done":k===on?"on":""}">${esc(s)}</li>`).join("")}</ol>
    <p class="wiz-live" id="wLive" aria-live="polite">${esc(live||"")}</p><button type="button" class="btn ghost" id="wStop">Stop</button></div></div>`;
  $("#wStop").onclick = ()=>wiz.ctl?.abort();
}
async function generate(){
  if (wiz.busy) return;
  let a; try{ a = cleanAnswers(wiz.a); }catch(e){ wiz.err = "Some answers are missing. Check the dates and destination."; return renderWizard(); }
  store.set("lastAnswers", a);
  if (!CONFIG.apiUrl) return showDemo(a);
  if (CONFIG.turnstileSiteKey && !wiz.token){ wiz.err = "Please complete the check above first."; $("#wErr").textContent = wiz.err; return; }
  const steps = ["Sending your answers", "Planning the route and checking facts", "Checking the plan", "Done"];
  wiz.busy = true; wiz.ctl = new AbortController();
  makeScreen(steps, 0, "Starting…");
  try{
    const r = await fetch(CONFIG.apiUrl.replace(/\/$/,"") + "/plan", {method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({answers:a, token:wiz.token}), signal: wiz.ctl.signal});
    if (!r.ok || !r.body){ let j = {}; try{ j = await r.json(); }catch(e){} throw {code: j.code || ("http_"+r.status), message: j.message || ""}; }
    const reader = r.body.getReader(), dec = new TextDecoder(); let buf = "", plan = null;
    makeScreen(steps, 1, "Thinking…");
    for (;;){
      const {value, done} = await reader.read(); if (done) break;
      buf += dec.decode(value, {stream:true}); const lines = buf.split("\n"); buf = lines.pop();
      for (const line of lines){ if (!line.trim()) continue; let ev; try{ ev = JSON.parse(line); }catch(e){ continue; }
        if (ev.t==="progress"){ const l = $("#wLive"); if (l) l.textContent = ev.msg || `Writing the plan… ${Math.round((ev.n||0)/100)/10}k characters`; }
        else if (ev.t==="stage") makeScreen(steps, ev.n, ev.msg||"");
        else if (ev.t==="plan") plan = ev.plan;
        else if (ev.t==="error") throw {code: ev.code, message: ev.message}; }
    }
    if (!plan) throw {code:"no_plan"};
    makeScreen(steps, 2, "");
    plan = validatePlan(plan, a, todayISO());   // the server checked it too; this keeps the page safe
    plan.id = "t" + Date.now().toString(36);
    saveMine(plan);
    wiz.busy = false; wiz.token = ""; wiz.step = 0; wiz.a = null;
    location.hash = "#trip/" + plan.id; toast("Your trip is ready");
  }catch(err){
    wiz.busy = false; wiz.token = "";
    const c = err?.code || (err?.name==="AbortError" ? "cancelled" : "");
    wiz.err = c==="cancelled" ? "Stopped. Nothing was created." :
      c==="rate_limited" ? "You've reached today's limit of new trips. Try again tomorrow." :
      c==="busy" ? "Lots of people are planning right now. Try again in a few minutes." :
      c==="robot_check" ? "The robot check didn't go through. Please try again." :
      c==="invalid_plan" ? "The plan didn't fit your dates. Try again, maybe with fewer wishes." :
      "Something went wrong while creating the trip. Please try again.";
    wiz.step = WIZ_STEPS.length-1; renderWizard();
  }
}
function showDemo(a){
  const text = chatPrompt(a);
  const close = samples.filter(s => a.dest && (s.dest.toLowerCase().includes(a.dest.toLowerCase().split(/[ ,']/)[0]) || a.dest.toLowerCase().includes(s.dest.toLowerCase().split(" ")[0])));
  $("#wizard").innerHTML = `<div class="wiz-shell"><div class="wiz-body">
    <h2 class="wiz-q">Live planning opens soon</h2>
    <p class="wiz-sub">We're testing the automatic planner. Until then you have two options:</p>
    <div class="xcard" style="margin-bottom:14px"><h3>1. Ask an AI assistant yourself</h3><p class="note" style="margin:0 0 10px">We turned your answers into a ready-made request. Copy it and paste it into Claude or another assistant.</p>
      <div class="prompt-box" id="pBox">${esc(text)}</div><div class="actions" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn primary" id="pCopy" type="button">Copy request</button><a class="btn" href="https://claude.ai/new" target="_blank" rel="noopener">Open Claude ↗</a></div></div>
    <div class="xcard"><h3>2. Explore a sample trip</h3><p class="note" style="margin:0 0 10px">See what a finished plan looks like.</p><div class="cards">${(close.length?close:samples).slice(0,3).map(cardHTML).join("")}</div></div>
    <div class="wiz-nav"><button type="button" class="btn ghost big" id="dBack">Back to my answers</button></div></div></div>`;
  $("#pCopy").onclick = () => navigator.clipboard?.writeText(text).then(()=>toast("Copied. Paste it into your assistant."), ()=>toast("Select the text and copy it"));
  $("#dBack").onclick = () => renderWizard();
  window.scrollTo({top:0});
}

// =====================================================================
// MY TRIPS + SHARING
// =====================================================================
function saveMine(plan){
  const list = store.get("trips", []).filter(t => t.id !== plan.id);
  list.unshift({id:plan.id, title:plan.title, dest:plan.dest, start:plan.start, savedAt:Date.now()});
  if (!store.set("trip_"+plan.id, plan)) { toast("This browser couldn't save the trip"); return false; }
  store.set("trips", list.slice(0,30)); return true;
}
const b64u = bytes => { let s=""; bytes.forEach(b=>s+=String.fromCharCode(b)); return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); };
const unb64u = s => { s = s.replace(/-/g,"+").replace(/_/g,"/"); const bin = atob(s); return Uint8Array.from(bin, c=>c.charCodeAt(0)); };
async function packPlan(plan){
  const json = new TextEncoder().encode(JSON.stringify({...plan, id:undefined}));
  if (window.CompressionStream){ const cs = new Blob([json]).stream().pipeThrough(new CompressionStream("deflate-raw")); return "z" + b64u(new Uint8Array(await new Response(cs).arrayBuffer())); }
  return "j" + b64u(json);
}
async function unpackPlan(s){
  const bytes = unb64u(s.slice(1));
  const raw = s[0]==="z" ? new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()) : bytes;
  return JSON.parse(new TextDecoder().decode(raw));
}
async function openShare(){
  const base = location.href.split("#")[0];
  const url = plan.sample ? `${base}#trip/${plan.id}` : `${base}#s=${await packPlan(plan)}`;
  $("#overlay").innerHTML = `<div class="scrim" id="scrim"><div class="drawer" role="dialog" aria-label="Share this trip"><h2>Share this trip</h2>
    <p class="note">Anyone with this link sees the trip as it is now. ${plan.sample?"":"The whole trip is inside the link, so it's long; nothing is stored on a server."}</p>
    <textarea class="share-url" readonly id="shUrl">${esc(url)}</textarea>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${navigator.share?`<button class="btn primary" id="shNative" type="button">Share…</button>`:""}<button class="btn${navigator.share?"":" primary"}" id="shCopy" type="button">Copy link</button></div>
    <button class="btn" id="closeD" style="align-self:start;margin-top:auto">Close</button></div></div>`;
  $("#closeD").onclick = closeDetail; $("#scrim").addEventListener("mousedown", e=>{ if (e.target.id==="scrim") closeDetail(); });
  $("#shCopy").onclick = () => navigator.clipboard?.writeText(url).then(()=>toast("Link copied"), ()=>{ $("#shUrl").select(); toast("Select and copy the link"); });
  const n = $("#shNative"); if (n) n.onclick = () => navigator.share({title: plan.title, url}).catch(()=>{});
}

// =====================================================================
// TRIP VIEW
// =====================================================================
let plan = null, items = [], dayInfo = new Map(), cfg = {}, view = "list", sharedUnsaved = false;
function setPlan(p){
  plan = p; cfg = p.cfg || {}; dayInfo = new Map((p.days||[]).map(d=>[d.date, d]));
  const byId = new Map((p.entries||[]).map(e=>[e.id, {...e}]));
  (p.days||[]).forEach(d => (d.stops||[]).forEach((id,k) => { const e = byId.get(id); if (e){ e.date = d.date; e.order = k; } }));
  items = [...byId.values()];
  (p.stages||[]).forEach(st => items.push({id:"base-"+st.id, type:"hotel", base:true, title:st.base, place:st.title, lat:st.lat, lng:st.lng, date:st.from, endDate:addDays(st.from, st.nights), notes:st.why, stage:st.id}));
  if (Number.isFinite(+cfg.hubLat) && Number.isFinite(+cfg.hubLng) && cfg.hubLat !== null){
    items.push({id:"hub-start", type:"other", title:cfg.hub, place:"Start of the trip", lat:cfg.hubLat, lng:cfg.hubLng, date:p.start, hub:"start"});
    items.push({id:"hub-end", type:"other", title:cfg.hub, place:"End of the trip", lat:cfg.hubLat, lng:cfg.hubLng, date:p.end, hub:"end"});
  }
  routeCache.clear(); map && (map.remove(), map = null); fitted = false;
}
function tripDays(){ if (!plan) return []; const out=[]; for (let d=plan.start; d<=plan.end && out.length<62; d=addDays(d,1)) out.push(d); return out; }
const hotelForNight = d => items.find(i=>i.type==="hotel" && i.date<=d && d<i.endDate);
function dayNodes(d){
  const nodes = [], morning = hotelForNight(addDays(d,-1)), night = hotelForNight(d);
  const hs = items.find(i=>i.hub==="start" && i.date===d), he = items.find(i=>i.hub==="end" && i.date===d);
  if (hs) nodes.push({item:hs, role:"arrive"}); else if (morning) nodes.push({item:morning, role:"start"});
  items.filter(i=>i.type!=="hotel" && !i.hub && i.date===d).sort((a,b)=>(a.time||"99").localeCompare(b.time||"99")||((a.order??1e9)-(b.order??1e9)))
    .forEach(i=>nodes.push({item:i, role:"stop"}));
  if (he) nodes.push({item:he, role:"depart"});
  else if (night && !(morning && morning.id===night.id && nodes.length===1 && nodes[0].item.id===morning.id)) nodes.push({item:night, role:"night"});
  else if (night && morning && morning.id===night.id) nodes[0].role = "stay";
  return nodes;
}
// ----- road routing (OSRM, in the visitor's browser, cached) -----
const routeCache = new Map(); const pending = new Set(); let queue = Promise.resolve();
try{ const c = store.get("routes", {}); for (const k in c) routeCache.set(k, c[k]); }catch(e){}
function saveRoutes(){ const o={}; [...routeCache].filter(([k,v])=>!v.failed).slice(-150).forEach(([k,v])=>o[k]=v); store.set("routes", o); }
function dayRoute(nodes){
  const pts = nodes.filter(n=>hasLoc(n.item)).map(n=>n.item).filter((p,i,a)=>i===0 || haversine(a[i-1],p) > 0.3);
  if (pts.length<2) return null;
  const key = pts.map(p=>`${(+p.lng).toFixed(5)},${(+p.lat).toFixed(5)}`).join(";");
  if (routeCache.has(key)) return routeCache.get(key);
  if (!pending.has(key)){ pending.add(key);
    queue = queue.then(()=>fetch(`${OSRM}${key}?overview=full&geometries=geojson&steps=false`).then(r=>r.ok?r.json():Promise.reject(r.status))
      .then(j=>{ if (j.code!=="Ok") throw j.code; const r=j.routes[0]; routeCache.set(key,{legs:r.legs.map(l=>({km:l.distance/1000,h:l.duration/3600})), geom:r.geometry.coordinates.map(([a,b])=>[+a.toFixed(5),+b.toFixed(5)])}); saveRoutes(); scheduleRender(); })
      .catch(()=>{ routeCache.set(key,{failed:true}); })
      .then(()=>new Promise(r=>setTimeout(r,450))));
  }
  return null;
}
function dayLegs(nodes){
  const route = dayRoute(nodes); let ri=0, km=0, h=0, est=false; const legs=[];
  for (let k=1;k<nodes.length;k++){
    const a=nodes[k-1].item, b=nodes[k].item;
    if (!hasLoc(a)||!hasLoc(b)){ legs.push({missing:true}); continue; }
    if (haversine(a,b) < 0.3){ legs.push({same:true}); continue; }
    let l = route && route.legs ? route.legs[ri] : null; ri++;
    if (!l) l = estimate(a,b);
    km += l.km; h += l.h; est = est || !!l.est; legs.push({...l, a, b});
  }
  return {legs, km, h, est, route};
}
let rq = 0; function scheduleRender(){ cancelAnimationFrame(rq); rq = requestAnimationFrame(()=>{ if (plan && !$("#trip").hidden) renderTrip(); }); }
const nav = {
  google:(b,a)=>`https://www.google.com/maps/dir/?api=1${a?`&origin=${ll(a)}`:""}&destination=${ll(b)}&travelmode=driving`,
  waze:b=>`https://waze.com/ul?ll=${ll(b)}&navigate=yes`,
  apple:(b,a)=>`https://maps.apple.com/?${a?`saddr=${ll(a)}&`:""}daddr=${ll(b)}&dirflg=d`,
  osm:b=>`https://www.openstreetmap.org/?mlat=${+b.lat}&mlon=${+b.lng}#map=15/${+b.lat}/${+b.lng}`,
  googleDay:pts=>{ const o=pts[0], d=pts[pts.length-1], w=pts.slice(1,-1).slice(0,9); return `https://www.google.com/maps/dir/?api=1&origin=${ll(o)}&destination=${ll(d)}${w.length?"&waypoints="+w.map(ll).join("%7C"):""}&travelmode=driving`; }
};
function gpx(day, nodes, geom){
  const pts = nodes.filter(n=>hasLoc(n.item)).map(n=>n.item);
  const x = s => esc(s);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="${x(CONFIG.siteName)}" xmlns="http://www.topografix.com/GPX/1/1">\n${pts.map(p=>`<wpt lat="${+p.lat}" lon="${+p.lng}"><name>${x(p.title)}</name></wpt>`).join("\n")}\n<rte><name>${x(fmtDay(day))}</name>${pts.map(p=>`<rtept lat="${+p.lat}" lon="${+p.lng}"><name>${x(p.title)}</name></rtept>`).join("")}</rte>\n${geom?`<trk><name>${x(fmtDay(day))}</name><trkseg>${geom.map(([lng,lat])=>`<trkpt lat="${lat}" lon="${lng}"/>`).join("")}</trkseg></trk>`:""}\n</gpx>`;
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([xml],{type:"application/gpx+xml"})); a.download = `route-${day}.gpx`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),5000);
}
function infoLinks(it){
  let q = (it.place && it.place.length < 60 && it.type!=="poi" ? it.place : it.title || "").replace(/\s*\(.*?\)\s*/g," ").trim();
  if (it.type==="poi" && it.place) q = `${it.title}, ${it.place}`;
  const country = cfg.country || "";
  const qc = !country || new RegExp("\\b"+country.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\b","i").test(q) ? q : q + ", " + country;
  const e = encodeURIComponent;
  const links = [["Wikipedia", `https://en.wikipedia.org/w/index.php?search=${e(qc)}&go=Go`]];
  if (cfg.lang && cfg.lang!=="en") links.push(["Wikipedia "+cfg.lang.toUpperCase(), `https://${cfg.lang}.wikipedia.org/w/index.php?search=${e(qc)}&go=Go`]);
  links.push(["Photos", `https://www.google.com/search?tbm=isch&q=${e(qc)}`], ["Tripadvisor", `https://www.tripadvisor.com/Search?q=${e(qc)}`]);
  if (cfg.tourismSite) links.push([cfg.tourismSite, `https://www.google.com/search?q=${e(q+" site:"+cfg.tourismSite)}`]);
  links.push(["Google Maps", hasLoc(it) ? `https://www.google.com/maps/search/?api=1&query=${(+it.lat).toFixed(5)},${(+it.lng).toFixed(5)}` : `https://www.google.com/maps/search/?api=1&query=${e(qc)}`]);
  return links.map(([l,u])=>`<a href="${u}" target="_blank" rel="noopener">${esc(l)}</a>`).join("");
}
// ----- Booking.com searches per base -----
const CATS = [
  {v:"value", label:"Best value", hint:"rated 7+, cheapest first", q:"&nflt=review_score%3D70&order=price"},
  {v:"special", label:"Top rated", hint:"guest score 9+", q:"&nflt=review_score%3D90"},
  {v:"comfort", label:"4–5★ comfort", hint:"hotels with 4 or 5 stars", q:"&nflt=class%3D4%3Bclass%3D5"},
  {v:"cabins", label:"Cabins & B&Bs", hint:"B&Bs, holiday homes, chalets", q:"&nflt=ht_id%3D208%3Bht_id%3D220%3Bht_id%3D228"}
];
function booking(st, cat){
  const a = plan.answers || {}, ages = Array.isArray(a.ages) ? a.ages : [];
  return `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(st.ss)}&checkin=${st.from}&checkout=${addDays(st.from, st.nights)}&group_adults=${+a.adults||2}&group_children=${ages.length}${ages.map(g=>`&age=${+g||0}`).join("")}&no_rooms=1&lang=en-gb${cat.q}`;
}

function renderCover(){
  const days = tripDays(); let km = 0; days.forEach(d=>{ km += dayLegs(dayNodes(d)).km; });
  const first = days[0], last = days[days.length-1], today = todayISO();
  let count = "";
  if (!plan.sample && first){ if (today < first){ const n = Math.round((toD(first)-toD(today))/864e5); count = n===1 ? "Starts tomorrow" : `${n} days to go`; } else if (today <= last) count = `Day ${days.indexOf(today)+1} of ${days.length}`; }
  const stat = (v,l)=>`<div class="cover-stat"><b>${v}</b><span>${l}</span></div>`;
  const gems = (plan.entries||[]).filter(e=>e.gem).length;
  return `<section class="trip-cover"><div class="hero-art">${artFor(plan.id||plan.title, plan.art)}</div><div class="cover-inner wrap">
    <p class="cover-eyebrow">${esc(cfg.country || plan.dest)} · ${esc(fmtShort(first))} – ${esc(fmtShort(last))} ${toD(last).getUTCFullYear()}${plan.sample?" · sample trip":""}</p>
    <h1 class="cover-title">${esc(plan.title)}</h1><p class="cover-sum">${esc(plan.summary||"")}</p>${count?`<p class="cover-sum" style="margin-top:8px"><b>${esc(count)}</b></p>`:""}
    <div class="cover-stats">${stat(days.length,"days")}${stat((plan.stages||[]).length,"bases")}${stat((plan.entries||[]).length,"places")}${gems?stat(gems,"hidden gems"):""}${km>0?stat(Math.round(km).toLocaleString("en-GB"),"km driving"):""}</div></div></section>`;
}
function stopHTML(node, day){
  const it = node.item, t = it.type||"other"; let time = it.time||""; const sub = [];
  if (node.role==="arrive"){ time="arrive"; sub.push("Start of the trip"); }
  if (node.role==="depart"){ time="end"; sub.push("Drop off the car"); }
  if (node.role==="start"){ time="start"; sub.push("Leaving your base"); }
  if (node.role==="night"){ time = it.date===day ? "night" : "night"; const nn = (plan.stages.find(s=>"base-"+s.id===it.id)||{}).nights||0; sub.push(it.date===day ? `New base · ${nn} night${nn===1?"":"s"}` : "Back to your base"); }
  if (node.role==="stay"){ time="all day"; sub.push("Free day at your base"); }
  if (it.place && !it.hub && t!=="hotel") sub.push(esc(it.place));
  const anchor = ["start","night","stay","arrive","depart"].includes(node.role) ? " anchor" : "";
  return `<button class="stop t-${t}${anchor}" data-id="${esc(it.id)}"><span class="stop-time">${esc(time)||"—"}</span><span class="stop-body"><span class="stop-title">${esc(it.title||"Untitled")}${it.gem?`<span class="gem-tag">◆ Hidden gem</span>`:""}</span><span class="stop-sub">${sub.join(" · ")}</span>${node.role==="stop"&&it.notes?`<span class="stop-sub">${esc(it.notes)}</span>`:""}</span><span class="tag">${t==="hotel"?"Base":TYPES[t]||"Other"}</span></button>`;
}
function legHTML(l){
  if (l.same) return `<div class="leg"><span class="leg-line"></span><span></span></div>`;
  if (l.missing) return `<div class="leg"><span class="leg-line"></span><span class="leg-info">No location for one of these stops</span></div>`;
  return `<div class="leg"><span class="leg-line"></span><span class="leg-info"><span class="${l.est?"est":""}">${l.est?"≈ ":""}<strong>${fmtKm(l.km)}</strong> · <strong>${fmtH(l.h)}</strong></span>
    <a class="btn waze" href="${nav.waze(l.b)}" target="_blank" rel="noopener">Waze</a><a class="btn" href="${nav.google(l.b,l.a)}" target="_blank" rel="noopener">Google</a><a class="btn" href="${nav.apple(l.b,l.a)}" target="_blank" rel="noopener">Apple</a></span></div>`;
}
function renderList(){
  return tripDays().map((d,ix)=>{
    const nodes = dayNodes(d), {legs,km,h,est} = dayLegs(nodes), info = dayInfo.get(d) || {};
    const pts = nodes.filter(n=>hasLoc(n.item)).map(n=>n.item).filter((p,i,a)=>i===0 || haversine(a[i-1],p) > 0.3);
    let html = `<section class="day" id="day-${d}"><div class="day-head"><span class="day-no">Day ${ix+1}</span><h2>${fmtDay(d)}${info.title?` · ${esc(info.title)}`:""}</h2><span class="day-drive">${km>0?`${est?"≈ ":""}${fmtKm(km)} · ${fmtH(h)}`:""}</span>
      ${pts.length>1?`<span class="day-tools"><a class="btn" href="${nav.googleDay(pts)}" target="_blank" rel="noopener">Whole day in Google Maps</a><button class="btn" data-gpx="${d}">GPX</button></span>`:""}</div>
      ${info.text?`<p class="day-text">${esc(info.text)}</p>`:""}<div class="stops">`;
    nodes.forEach((n,k)=>{ if (k) html += legHTML(legs[k-1]); html += stopHTML(n,d); });
    return html + `</div>${info.tip?`<p class="day-tip">${esc(info.tip)}</p>`:""}</section>`;
  }).join("");
}
function renderStays(){
  const style = (plan.answers||{}).stay || "value";
  return `<section class="sg">${plan.stages.map((st,si)=>{ const out = addDays(st.from, st.nights);
    return `<article class="sg-stage"><header class="sg-head"><span class="sg-no">${si+1}</span><div><h3>${esc(st.title)}</h3><div class="sg-meta">${esc(fmtShort(st.from))} → ${esc(fmtShort(out))} · ${st.nights} night${st.nights>1?"s":""} · base ${esc(st.base)}</div></div></header>
      <div class="sg-hotels">${st.why?`<p class="stay-why">${esc(st.why)}</p>`:""}<div class="sg-hotels-head"><b>Search stays in ${esc(st.base)}</b><span>${esc(travellersText(plan.answers||{}))}</span></div>
      <div class="sg-cats">${CATS.map(c=>`<a class="sg-cat" href="${booking(st,c)}" target="_blank" rel="noopener"${c.v===style?' style="border-color:var(--copper)"':""}><b>${c.label}</b><span>${c.v===style?"matches your style":c.hint}</span></a>`).join("")}</div></div></article>`; }).join("")}
    <p class="note">Buttons open Booking.com searches for these dates and travellers. We don't book anything and don't earn from these links.</p></section>`;
}
function renderExtras(){
  const x = plan.extras || {}, start = plan.start, today = todayISO(), id = plan.id || "x";
  const checked = new Set(store.get("chk_"+id, []));
  const checks = (list, pre) => `<ul class="checks">${list.map((t,k)=>`<li><label><input type="checkbox" data-chk="${pre}${k}"${checked.has(pre+k)?" checked":""}><span>${esc(t)}</span></label></li>`).join("")}</ul>`;
  const persons = ((plan.answers||{}).adults||2) + ((plan.answers||{}).ages||[]).length, n = plan.stages.reduce((s,t)=>s+t.nights,0);
  const b = x.budget, fmtM = v => Math.round(v).toLocaleString("en-GB");
  const before = ["Check opening days and times of every stop","Check road, weather and ferry conditions a few days ahead","Check entry, visa and driving-licence rules for your nationality","Save offline maps of the region"];
  return `<div class="extras">
    ${x.season?`<div class="xcard wide"><h3>Season check</h3><p class="season">${esc(x.season)}</p></div>`:""}
    ${(x.bookBy||[]).length?`<div class="xcard"><h3>What to book and when</h3><ol class="timeline">${x.bookBy.map(t=>{ const when = addDays(start, -7*t.weeks); return `<li class="${when<today&&!plan.sample?"past":""}"><time>${plan.sample?(t.weeks?t.weeks+" weeks before":"Just before"):"by "+esc(fmtShort(when))}</time><span>${esc(t.what)}</span></li>`; }).join("")}</ol></div>`:""}
    ${b?`<div class="xcard"><h3>Rough budget</h3><p class="budget-big">${fmtM(b.low)}–${fmtM(b.high)} ${esc(b.currency)}</p><p class="budget-sub">per person per day. ${esc(b.includes||"")}</p>
      <p class="budget-sub"><b>Whole trip, ${persons} ${persons>1?"people":"person"}, ${n+1} days:</b> about ${fmtM(b.low*persons*(n+1))}–${fmtM(b.high*persons*(n+1))} ${esc(b.currency)}</p>${b.notes?`<p class="budget-sub">${esc(b.notes)}</p>`:""}<p class="budget-sub">A rough estimate for planning, not a quote.</p></div>`:""}
    ${(x.packing||[]).length?`<div class="xcard"><h3>Packing list</h3>${checks(x.packing,"p")}</div>`:""}
    ${(x.documents||[]).length?`<div class="xcard"><h3>Documents</h3>${checks(x.documents,"d")}</div>`:""}
    <div class="xcard"><h3>Before you go</h3>${checks(before,"b")}</div>
    ${(plan.notes||[]).length?`<div class="xcard wide"><h3>Good to know</h3><ul class="sg-notes">${plan.notes.map(n=>`<li class="sg-note ${n.kind==="conflict"?"warn":""}">${esc(n.text)}</li>`).join("")}</ul></div>`:""}
  </div>`;
}
// ----- map -----
let map = null, layer = null, fitted = false, mapDay = "";
function initMap(){
  if (map || !window.L) return !!map;
  map = L.map("map",{zoomSnap:.5}).setView(cfg.center || [30,10], cfg.zoom || 5);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Routing <a href="https://project-osrm.org">OSRM</a>'}).addTo(map);
  layer = L.layerGroup().addTo(map);
  map.on("popupopen", e=>{ const b = e.popup.getElement()?.querySelector("[data-id]"); if (b) b.onclick = ()=>{ map.closePopup(); openDetail(b.dataset.id); }; });
  return true;
}
const pin = (it,label) => L.divIcon({className:`pin t-${it.type||"other"}${it.gem?" gem":""}`, html:`<b>${esc(label)}</b>`, iconSize:[26,26], iconAnchor:[13,13], popupAnchor:[0,-13]});
function updateMap(){
  if (!initMap()){ $("#mapSum").textContent = "The map didn't load. Check your connection."; return; }
  map.invalidateSize(); layer.clearLayers();
  const days = tripDays(), sel = $("#mapDay");
  const opts = `<option value="">All days</option>` + days.map((d,i)=>`<option value="${d}">Day ${i+1} · ${fmtDay(d)}</option>`).join("");
  if (sel.dataset.sig !== opts){ sel.innerHTML = opts; sel.dataset.sig = opts; } sel.value = mapDay;
  const bounds = [], placed = new Map(); let km = 0, h = 0;
  (mapDay ? [mapDay] : days).forEach(d=>{
    const di = days.indexOf(d), cls = "d"+(di%6+1), nodes = dayNodes(d), r = dayLegs(nodes); km += r.km; h += r.h;
    if (r.route && r.route.geom) L.polyline(r.route.geom.map(([a,b])=>[b,a]),{className:"route "+cls, interactive:false}).addTo(layer);
    else { const p = nodes.filter(n=>hasLoc(n.item)).map(n=>[+n.item.lat,+n.item.lng]); if (p.length>1) L.polyline(p,{className:"route est "+cls, interactive:false}).addTo(layer); }
    nodes.forEach(n=>{ if (!hasLoc(n.item)) return; const k = n.item.hub ? "hub" : n.item.id, e = placed.get(k); if (!e) placed.set(k,{it:n.item, days:[di+1]}); else if (!e.days.includes(di+1)) e.days.push(di+1); });
  });
  placed.forEach(({it, days:ds})=>{ const lab = it.hub ? "✈" : ds.length>1 ? ds[0]+"–"+ds[ds.length-1] : String(ds[0]);
    L.marker([+it.lat,+it.lng],{icon:pin(it,lab), title:it.title}).bindPopup(`<b>${esc(it.title)}</b>${esc(it.place||"")}<br><button class="btn" data-id="${esc(it.id)}">Details & navigate</button>`).addTo(layer); bounds.push([+it.lat,+it.lng]); });
  $("#mapSum").textContent = km ? `${fmtKm(km)} · ${fmtH(h)} driving` : "";
  if (!fitted && bounds.length){ bounds.length===1 ? map.setView(bounds[0],11) : map.fitBounds(bounds,{padding:[40,40], maxZoom:12}); fitted = true; }
}
$("#mapDay").addEventListener("change", e=>{ mapDay = e.target.value; fitted = false; updateMap(); });
// ----- detail drawer -----
function openDetail(id){
  const it = items.find(i=>i.id===id); if (!it) return;
  const st = it.stage ? plan.stages.find(s=>s.id===it.stage) : null;
  const when = it.hub ? (it.hub==="start" ? "Start · "+fmtDay(plan.start) : "End · "+fmtDay(plan.end)) : it.type==="hotel" ? `${fmtDay(it.date)} → ${fmtDay(it.endDate)}` : it.date ? fmtDay(it.date)+(it.time?" · "+it.time:"") : "Not scheduled";
  $("#overlay").innerHTML = `<div class="scrim" id="scrim"><div class="drawer" role="dialog" aria-label="${esc(it.title)}">
    <span class="tag t-${it.type||"other"}" style="align-self:start">${it.type==="hotel"?"Base":TYPES[it.type]||"Other"}</span>${it.gem?`<span class="gem-tag" style="align-self:start">◆ Hidden gem</span>`:""}
    <h2>${esc(it.title)}</h2><div class="note">${esc(when)}${it.place&&!it.hub?"<br>"+esc(it.place):""}</div>
    ${it.why?`<p class="why">${esc(it.why)}</p>`:""}${it.notes?`<p style="white-space:pre-wrap">${esc(it.notes)}</p>`:""}
    ${it.url?`<a href="${esc(it.url)}" target="_blank" rel="noopener">Official website ↗</a>`:""}
    ${st?`<div class="info-block"><span class="lbl">Find a place to stay</span><span class="info-links">${CATS.map(c=>`<a href="${booking(st,c)}" target="_blank" rel="noopener">${c.label}</a>`).join("")}</span></div>`:""}
    <div class="info-block"><span class="lbl">Learn more</span><span class="info-links">${infoLinks(it)}</span></div>
    ${hasLoc(it)?`<div class="note" style="margin-top:6px">Navigate here from where you are</div>
      <div class="navgrid"><a class="btn waze" href="${nav.waze(it)}" target="_blank" rel="noopener">Waze</a><a class="btn" href="${nav.google(it)}" target="_blank" rel="noopener">Google Maps</a>
      <a class="btn" href="${nav.apple(it)}" target="_blank" rel="noopener">Apple Maps</a><a class="btn" href="${nav.osm(it)}" target="_blank" rel="noopener">OpenStreetMap</a></div>
      <div class="coords">${ll(it)}</div>`:`<p class="note">No exact location for this entry.</p>`}
    <p class="note">AI-made suggestion: check opening times and details locally.</p>
    <button class="btn" id="closeD" style="align-self:start;margin-top:auto">Close</button></div></div>`;
  $("#closeD").onclick = closeDetail; $("#scrim").addEventListener("mousedown", e=>{ if (e.target.id==="scrim") closeDetail(); });
}
function closeDetail(){ $("#overlay").innerHTML = ""; }
document.addEventListener("keydown", e=>{ if (e.key==="Escape") closeDetail(); });

function renderTrip(){
  const m = view==="map";
  $("#tripCover").innerHTML = renderCover();
  const days = tripDays(); let km=0, h=0, est=false; days.forEach(d=>{ const r=dayLegs(dayNodes(d)); km+=r.km; h+=r.h; est=est||r.est; });
  $("#tripName").textContent = plan.title; document.title = plan.title + " — " + CONFIG.siteName;
  $("#tripFlag").textContent = plan.sample ? "Sample trip" : sharedUnsaved ? "Shared with you" : "Your trip";
  $("#tripMeta").innerHTML = [`${fmtShort(days[0])} – ${fmtShort(days[days.length-1])} · <b>${days.length}</b> days`, `<b>${plan.stages.length}</b> bases`, `${est?"≈ ":""}<b>${fmtKm(km)}</b> · <b>${fmtH(h)}</b> driving`].map(p=>`<span>${p}</span>`).join("");
  ["list","map","stays","extras"].forEach(v=>$("#v_"+v).setAttribute("aria-pressed", view===v));
  $("#btnSave").hidden = !sharedUnsaved;
  $("#view").hidden = m; $("#mapView").hidden = !m;
  if (m) updateMap(); else $("#view").innerHTML = view==="stays" ? renderStays() : view==="extras" ? renderExtras() : renderList();
}
async function showTrip(p, opts={}){
  sharedUnsaved = !!opts.shared; setPlan(p); view = opts.view || "list"; mapDay = "";
  setScreen("trip"); renderTrip(); window.scrollTo({top:0});
}
function setView(v){ view = v; if (v==="map") fitted = false; renderTrip(); document.querySelector("header.top")?.scrollIntoView({block:"start"}); }
["list","map","stays","extras"].forEach(v=>$("#v_"+v).onclick = ()=>setView(v));
$("#btnShare").onclick = () => openShare();
$("#btnSave").onclick = () => { plan.id = "t"+Date.now().toString(36); if (saveMine(plan)){ sharedUnsaved = false; history.replaceState(null, "", "#trip/"+plan.id); renderTrip(); toast("Saved to your trips"); } };
$("#btnPrint").onclick = () => {
  $("#view").hidden = false; $("#mapView").hidden = true;
  $("#view").innerHTML = `<div class="print-only">${disclaimerHTML(true)}</div><h2 class="h-sec" style="margin-top:20px">Day by day</h2>${renderList()}<h2 class="h-sec">Where to stay</h2>${renderStays()}<h2 class="h-sec">Extras</h2>${renderExtras()}`;
  setTimeout(()=>{ window.print(); renderTrip(); }, 200);
};
document.addEventListener("click", e=>{
  const s = e.target.closest(".stop"); if (s){ openDetail(s.dataset.id); return; }
  const g = e.target.closest("[data-gpx]"); if (g){ const n = dayNodes(g.dataset.gpx); gpx(g.dataset.gpx, n, dayLegs(n).route?.geom); return; }
  const del = e.target.closest("[data-del]"); if (del){ const id = del.dataset.del; store.set("trips", store.get("trips",[]).filter(t=>t.id!==id)); store.del("trip_"+id); store.del("chk_"+id); showHome(); return; }
  const idea = e.target.closest(".idea"); if (idea){ location.hash = `#plan?new=1&dest=${encodeURIComponent(idea.dataset.dest)}&month=${idea.dataset.month}`; return; }
  if (e.target.closest("#sShuffle")){ surpriseSeed = Date.now(); $("#surpriseBox").innerHTML = surpriseHTML(); return; }
});
document.addEventListener("change", e=>{
  if (e.target.id==="sMonth"){ surpriseMonth = +e.target.value; $("#surpriseBox").innerHTML = surpriseHTML(); }
  const c = e.target.closest && e.target.closest("[data-chk]");
  if (c && plan){ const k = "chk_"+(plan.id||"x"), s = new Set(store.get(k, [])); c.checked ? s.add(c.dataset.chk) : s.delete(c.dataset.chk); store.set(k, [...s]); }
});

// =====================================================================
// ROUTER
// =====================================================================
function setScreen(name){
  for (const s of ["home","wizard","trip"]) $("#"+s).hidden = s!==name;
  closeDetail();
}
async function route(){
  const h = location.hash || "";
  if (wiz.busy && !h.startsWith("#plan")) { wiz.ctl?.abort(); }
  if (h.startsWith("#plan")) return showWizard(new URLSearchParams(h.split("?")[1]||""));
  if (h.startsWith("#trip/")){
    const id = decodeURIComponent(h.slice(6));
    const mine = store.get("trip_"+id, null);
    if (mine) return showTrip(mine);
    try{ const r = await fetch(`data/samples/${encodeURIComponent(id)}.json`, {cache:"no-cache"}); if (!r.ok) throw 0; return showTrip(await r.json()); }
    catch(e){ setScreen("home"); await showHome(); toast("That trip couldn't be found on this device."); return; }
  }
  if (h.startsWith("#s=")){
    try{ const p = await unpackPlan(h.slice(3)); const ok = validatePlan({...p, config:p.cfg, season:(p.extras||{}).season}, cleanAnswers({...p.answers, start:p.start, end:p.end}), p.createdAt || todayISO()); ok.art = p.art; ok.sample = false; return showTrip(ok, {shared:true}); }
    catch(e){ await showHome(); toast("This shared link is damaged or incomplete."); return; }
  }
  await showHome();
  const sec = h.slice(1); if (sec && document.getElementById(sec)) requestAnimationFrame(()=>document.getElementById(sec).scrollIntoView({behavior:"smooth"}));
}
window.addEventListener("hashchange", route);
loadSamples().then(route);
