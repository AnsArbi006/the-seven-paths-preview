import * as THREE from 'three';
import { MAX_TP, MAX_HP, BASE_CASTLE_HITS, FIELDS, FIELD_BY_ID, HORDE_ROUTE, initialState, travel, canSleep, sleep, buy, dropOnDeath } from './rules.js';
import { createArcher, createEnemy, createTree, createGroundTexture } from './visuals.js';
import './style.css';

const app = document.querySelector('#app');
let game = initialState();
let combat = null;
let world = null;
const fieldIcons = { castle: '♜', meadow: '✦', crossroads: '✣', forest: '♠', marsh: '◈', quarry: '◆', river: '≈', watchtower: '♜' };

app.innerHTML = `
  <main class="game-shell">
    <div class="world-card">
      <div id="worldViewport" aria-label="Begehbare 3D-Welt; klicke auf den Boden, um den Bogenschützen zu bewegen"></div>
      <div class="hud-brand"><span class="brand-mark">✦</span><div><strong>THE SEVEN PATHS</strong><small>KAPITEL I · SPIELBARE VORSCHAU</small></div></div>
      <div class="world-topline"><span><span class="live-dot"></span> <span id="phaseLabel">ERKUNDUNG</span></span><button id="fullscreenBtn" class="text-button" aria-label="Vollbild umschalten">⛶ &nbsp; Vollbild</button><button id="guideBtn" class="text-button">? &nbsp; Hilfe</button></div>
      <aside class="hud-left" aria-label="Held und Status">
        <div class="hero-card"><div class="hero-portrait">🏹</div><div><div class="eyebrow">DEIN HELD</div><h2>Der Bogenschütze</h2><p>Agil · Distanz · Rolle</p></div></div>
        <div class="stat-grid"><div class="stat"><small>TAG</small><strong id="dayStat">01</strong></div><div class="stat"><small>REISE</small><strong id="tpStat">7 <span>/ 7</span></strong></div><div class="stat"><small>LEBEN</small><strong id="hpStat">100</strong></div><div class="stat"><small>PFEILE</small><strong id="arrowStat">12</strong></div></div>
        <button id="mobileActionsBtn" class="mobile-actions-btn" aria-expanded="false">⌄ &nbsp; Ort & Aktionen</button>
        <div class="card location-card"><div class="card-heading"><span>AKTUELLER ORT</span><span id="locationIcon">♜</span></div><h3 id="locationName">Königsburg</h3><p id="locationText"></p><div id="locationActions" class="action-list"></div></div>
        <button id="sleepBtn" class="primary-btn">✦ &nbsp; Tag beenden</button><p class="small footnote" id="sleepHint">Schlafen ist nur in gegnerfreien Feldern möglich.</p>
      </aside>
      <aside class="hud-right" aria-label="Karte und Aufgaben">
        <div class="minimap" aria-label="Minimap der Welt"><div class="minimap-title">WELTKARTE <span id="miniLocation">Königsburg</span></div><div class="mini-frame"><img src="./assets/seven-paths-map.png" alt="Kleine Übersicht der Welt"/><svg id="mapSvg" viewBox="0 0 1000 667" preserveAspectRatio="none" aria-label="Feldübersicht"></svg></div><div class="mini-legend"><span>● Du</span><span>● Gegner</span><span>● Quest</span></div></div>
        <details class="hud-drawer quest-card"><summary><span class="drawer-icon">✦</span><span><small>HAUPTQUEST</small><strong>Das Silberblatt</strong></span><span class="drawer-chevron">⌄</span></summary><div class="drawer-content"><p id="questText"></p><div id="questProgress" class="quest-progress"></div></div></details>
        <details class="hud-drawer threat-card"><summary><span class="drawer-icon danger">♜</span><span><small>BURG & HORDE</small><strong id="threatLabel">Horde am Wachturm</strong></span><span class="drawer-chevron">⌄</span></summary><div class="drawer-content"><div class="meter"><div id="castleMeter"></div></div><div class="threat-row"><span id="castleText"></span><span id="goldText"></span></div><p class="small" id="routeText"></p></div></details>
      </aside>
      <div class="destination-label" id="destinationLabel">KÖNIGSBURG</div>
      <div class="world-prompt" id="worldPrompt">KLICKE AUF DEN BODEN, UM ZU LAUFEN · WÄHLE EIN ZIEL AUF DER KARTE</div>
    </div>
  </main>
  <div id="toast" role="status" aria-live="polite"></div>
  <div id="overlay" class="overlay hidden" role="dialog" aria-modal="true"></div>
`;

const $ = selector => document.querySelector(selector);
const esc = str => String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const point = field => ({ x: field.x * 10, y: field.y * 6.67 });
const worldPoint = field => new THREE.Vector3((field.x - 50) * 1.32, 0, (field.y - 50) * 1.12);
const fieldAt = position => FIELDS.reduce((best, field) => position.distanceToSquared(worldPoint(field)) < position.distanceToSquared(worldPoint(best)) ? field : best, FIELDS[0]);
function shortestPath(start, goal) {
  const queue = [[start]];
  const seen = new Set([start]);
  while (queue.length) {
    const path = queue.shift();
    const last = path.at(-1);
    if (last === goal) return path;
    for (const next of FIELD_BY_ID[last].neighbors) if (!seen.has(next)) { seen.add(next); queue.push([...path, next]); }
  }
  return null;
}
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 3700); }

$('#mobileActionsBtn').addEventListener('click', () => {
  const open = $('.hud-left').classList.toggle('actions-open');
  $('#mobileActionsBtn').setAttribute('aria-expanded', String(open));
  $('#mobileActionsBtn').innerHTML = open ? '⌃ &nbsp; Ort & Aktionen schließen' : '⌄ &nbsp; Ort & Aktionen';
});

function renderMap() {
  const edges = [];
  for (const f of FIELDS) for (const id of f.neighbors) if (f.id < id) {
    const a = point(f), b = point(FIELD_BY_ID[id]);
    edges.push(`<line class="edge ${f.id === game.field || id === game.field ? 'reachable' : ''}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`);
  }
  const currentHorde = HORDE_ROUTE[game.hordeIndex];
  const routeLine = HORDE_ROUTE.map(id => { const p = point(FIELD_BY_ID[id]); return `${p.x},${p.y}`; }).join(' ');
  const nodes = FIELDS.map(f => {
    const p = point(f);
    const active = f.id === game.field;
    const reachable = FIELD_BY_ID[game.field].neighbors.includes(f.id) && game.tp > 0;
    const enemy = (f.id === 'forest' && game.forestEnemyAlive) || (f.id === currentHorde && game.hordeIndex > 0) || (f.id === 'watchtower' && game.bossAlive);
    const quest = f.id === game.questItemField && game.questItemOnGround;
    return `<g class="field ${active ? 'active' : ''} ${reachable ? 'reachable' : ''}" data-field="${f.id}" tabindex="0" role="button" aria-label="Route nach ${esc(f.name)}"><circle class="field-ring" cx="${p.x}" cy="${p.y}" r="${active ? 24 : 20}"/><circle class="field-core" cx="${p.x}" cy="${p.y}" r="13"/><text class="field-icon" x="${p.x}" y="${p.y + 5}">${fieldIcons[f.id]}</text>${enemy ? `<circle class="enemy-indicator" cx="${p.x + 15}" cy="${p.y - 15}" r="7"/>` : ''}${quest ? `<circle class="quest-indicator" cx="${p.x - 15}" cy="${p.y - 15}" r="7"/>` : ''}</g>`;
  }).join('');
  const marker = world ? { x: world.hero.position.x / 1.32 + 50, y: world.hero.position.z / 1.12 + 50 } : game.marker;
  $('#mapSvg').innerHTML = `<polyline class="horde-route" points="${routeLine}"/>${edges.join('')}${nodes}<g id="playerMarker" class="player-marker" transform="translate(${marker.x * 10},${marker.y * 6.67})"><circle r="12"/><path d="M0,-17 L8,2 L0,-3 L-8,2 Z"/></g>`;
  $('#miniLocation').textContent = FIELD_BY_ID[game.field].name;
  $('#mapSvg').querySelectorAll('.field').forEach(node => {
    node.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); chooseField(node.dataset.field); } });
  });
}

function chooseField(id) {
  if (game.phase !== 'explore') return;
  world?.moveTo(worldPoint(FIELD_BY_ID[id]));
}

$('#mapSvg').addEventListener('pointerdown', event => {
  event.stopPropagation();
  const node = event.target.closest?.('[data-field]');
  if (node) { chooseField(node.dataset.field); return; }
  const rect = event.currentTarget.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width * 100;
  const y = (event.clientY - rect.top) / rect.height * 100;
  const nearest = FIELDS.reduce((best, field) => Math.hypot((field.x - x) * 1.5, field.y - y) < Math.hypot((best.x - x) * 1.5, best.y - y) ? field : best, FIELDS[0]);
  chooseField(nearest.id);
});

function enteredField(id, origin) {
  if (id === 'forest' && game.forestEnemyAlive) { startCombat('scout', origin); return; }
  if (id === HORDE_ROUTE[game.hordeIndex] && game.hordeIndex > 0) { startCombat('horde', origin); return; }
  if (id === 'watchtower' && game.bossAlive && game.questItem) { startCombat('boss', origin); return; }
  if (id === 'watchtower' && !game.questItem) toast('Am Wachturm brauchst du das Silberblatt.');
  else toast(`${FIELD_BY_ID[id].name} erreicht. 1 Reisepunkt verbraucht.`);
  render();
}

function renderSidebar() {
  $('#dayStat').textContent = String(game.day).padStart(2, '0');
  $('#tpStat').innerHTML = `${game.tp} <span>/ ${MAX_TP}</span>`;
  $('#hpStat').textContent = game.hp;
  $('#arrowStat').textContent = game.arrows;
  $('#locationIcon').textContent = fieldIcons[game.field];
  $('#locationName').textContent = FIELD_BY_ID[game.field].name;
  $('#phaseLabel').textContent = game.phase === 'explore' ? 'ERKUNDUNG' : game.phase.toUpperCase();
  const descriptions = {
    castle: 'Ein sicherer Ort für Vorräte und Schilde. Hier beginnt jeder neue Held seinen Weg.',
    meadow: 'Der offene Weg zur Burg. Jede Horde muss hier vorbei.',
    crossroads: 'Drei Pfade kreuzen sich. Wähle zwischen Gefahr im Norden und dem Weg zum Fluss.',
    forest: game.forestEnemyAlive ? 'Ein Späher blockiert den Nebelwald. Im Kampf zählt jede Rolle.' : 'Der Wald ist gesichert. Hier kannst du rasten.',
    marsh: 'Ein gefährlicher Marsch. Beobachte die Route der Horde vor dem Schlafen.',
    quarry: 'Alte Steine, verlassene Werkzeuge und ein ruhiger Umweg zum Fluss.',
    river: 'Hier wächst das gesuchte Silberblatt. Seine Bedeutung zeigt sich am Wachturm.',
    watchtower: game.questItem ? 'Das Silberblatt öffnet den Weg zum Wächter.' : 'Eine dunkle Macht wartet. Du brauchst das Silberblatt.'
  };
  $('#locationText').textContent = descriptions[game.field];
  $('#questText').textContent = game.questItem ? 'Silberblatt gefunden! Erreiche den Wachturm und besiege den Wächter.' : 'Finde das Silberblatt am Flussufer. Danach wartet der Wächter am Wachturm.';
  $('#questProgress').innerHTML = `<span class="${game.questItem ? 'done' : ''}">1. Silberblatt finden</span><span class="${!game.bossAlive ? 'done' : ''}">2. Wächter besiegen</span>`;
  const actions = [];
  if (game.field === 'castle') {
    actions.push(`<button data-action="shield">Schild kaufen <span>3 Gold · +1 Burgschutz</span></button>`);
    actions.push(`<button data-action="arrows">Pfeile kaufen <span>2 Gold · +8 Pfeile</span></button>`);
  }
  if (game.field === game.questItemField && game.questItemOnGround) actions.push(`<button data-action="quest">Silberblatt aufheben <span>Storygegenstand</span></button>`);
  if (['quarry', 'marsh', 'meadow'].includes(game.field) && !game.claimed[game.field]) actions.push(`<button data-action="loot">Vorräte durchsuchen <span>+2 Pfeile · +1 Gold</span></button>`);
  if (game.field === 'forest' && game.forestEnemyAlive && game.phase === 'explore') actions.push(`<button data-action="fight">Späher bekämpfen <span>Action-Kampf</span></button>`);
  if (game.field === 'watchtower' && game.questItem && game.bossAlive && game.phase === 'explore') actions.push(`<button data-action="boss">Wächter herausfordern <span>Finaler Kampf</span></button>`);
  $('#locationActions').innerHTML = actions.join('') || '<div class="muted">Hier gibt es gerade keine Aktion.</div>';
  $('#locationActions').querySelectorAll('button').forEach(button => button.addEventListener('click', () => takeAction(button.dataset.action)));
  const maxHits = BASE_CASTLE_HITS + game.shields;
  $('#castleMeter').style.width = `${Math.min(100, (game.castleHits / maxHits) * 100)}%`;
  $('#castleText').textContent = `Burgschaden ${game.castleHits} / ${maxHits}`;
  $('#goldText').textContent = `${game.gold} Gold`;
  const hordeId = HORDE_ROUTE[game.hordeIndex];
  const nextId = HORDE_ROUTE[Math.min(game.hordeIndex + 1, HORDE_ROUTE.length - 1)];
  $('#threatLabel').textContent = `Horde: ${FIELD_BY_ID[hordeId].name}`;
  $('#routeText').textContent = `Nächste Nacht: ${FIELD_BY_ID[hordeId].name} → ${FIELD_BY_ID[nextId].name}. Rote Linie auf der Karte zeigt die Route.`;
  const block = canSleep(game);
  $('#sleepBtn').disabled = Boolean(block);
  $('#sleepHint').textContent = block || 'Ungenutzte Reisepunkte verfallen. Die Horde zieht nachts ein Feld.';
}

function takeAction(action) {
  if (action === 'shield' || action === 'arrows') {
    const result = buy(game, action);
    toast(result.ok ? action === 'shield' ? 'Ein Schild schützt die Burg vor einem weiteren Treffer.' : 'Acht Pfeile gekauft.' : result.reason);
  } else if (action === 'quest') {
    game.questItem = true; game.questItemOnGround = false; toast('Silberblatt gefunden. Der Wachturm ruft.');
  } else if (action === 'loot') {
    game.claimed[game.field] = true; game.arrows += 2; game.gold += 1; toast('Zwei Pfeile und ein Goldstück gefunden.');
  } else if (action === 'fight') startCombat('scout');
  else if (action === 'boss') startCombat('boss');
  render();
}

$('#sleepBtn').addEventListener('click', () => {
  if (world) { world.route = []; world.targetRing.visible = false; }
  const result = sleep(game);
  if (!result.ok) { toast(result.reason); return; }
  if (game.field === 'castle' && world && world.hero.position.distanceTo(worldPoint(FIELD_BY_ID.castle)) > 12) world.teleport('castle');
  if (game.phase === 'loss') return showEnding(false);
  toast(result.morningDamage ? `Tag ${game.day}: Ein Gegner auf deiner Route traf dich beim Erwachen (${result.morningDamage} Schaden).` : `Tag ${game.day} beginnt. Die Horde ist weitergezogen.`);
  if (HORDE_ROUTE[game.hordeIndex] === game.field && game.hordeIndex > 0) startCombat('horde');
  render();
});

$('#guideBtn').addEventListener('click', () => {
  $('#overlay').classList.remove('hidden');
  $('#overlay').innerHTML = `<div class="modal guide"><button class="close" id="closeOverlay" aria-label="Schließen">×</button><div class="eyebrow">SO SPIELST DU</div><h2>Erkunden. Planen. Kämpfen.</h2><div class="guide-grid"><div><strong>01 · Laufen</strong><p>Klicke auf den Boden der 3D-Welt. Dein Held läuft zum Ziel; die Kamera folgt. Ein Klick auf die Minimap plant ebenfalls eine Route. Erst beim Überqueren einer Feldgrenze kostet es einen von sieben Reisepunkten.</p></div><div><strong>02 · Rasten</strong><p>Nur gegnerfreie Felder erlauben Schlaf. Der Tag endet; ungenutzte Punkte verfallen. Die Horde zieht nachts entlang der roten Route zur Burg.</p></div><div><strong>03 · Kämpfen</strong><p>Im Kampf: WASD bewegen, Maus zielen, Linksklick schießen, Leertaste rollen. Der Schuss unmittelbar nach einer Rolle streut. Pfeile sind begrenzt.</p></div><div><strong>04 · Gewinnen</strong><p>Finde das Silberblatt am Flussufer und besiege den Wächter am Wachturm. Die Burg fällt nach drei Treffern, plus einem weiteren pro gekauftem Schild.</p></div></div><p class="modal-note">Dieser Web-Prototyp ist eine Einzelspieler-Vorschau. Steam-Lobbys, Einladungen, Handel und echte Mehrspieler-Kämpfe folgen im Unity-Spiel.</p><button class="primary-btn" id="closeGuide">Verstanden</button></div>`;
  $('#closeOverlay').onclick = closeOverlay; $('#closeGuide').onclick = closeOverlay;
});
$('#fullscreenBtn').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { toast('Vollbild wird von diesem Browser nicht unterstützt.'); }
});
document.addEventListener('fullscreenchange', () => {
  $('#fullscreenBtn').innerHTML = document.fullscreenElement ? '⛶ &nbsp; Vollbild verlassen' : '⛶ &nbsp; Vollbild';
});
function closeOverlay() { $('#overlay').classList.add('hidden'); $('#overlay').innerHTML = ''; }
function render() { renderMap(); renderSidebar(); }

function showEnding(won) {
  combat?.dispose(); combat = null;
  game.phase = won ? 'victory' : 'loss';
  $('#overlay').classList.remove('hidden');
  $('#overlay').innerHTML = `<div class="modal ending"><div class="eyebrow">${won ? 'KAPITEL GESCHAFFT' : 'KAPITEL VERLOREN'}</div><h2>${won ? 'Ein Weg durch die Dunkelheit.' : 'Die Burg ist gefallen.'}</h2><p>${won ? 'Der Wächter ist besiegt und das Silberblatt gerettet. Du hast den ersten Prototyp durchgespielt.' : esc(game.result || 'Die Horde hat die Verteidigung überwunden.')}</p><button id="restartBtn" class="primary-btn">Neues Kapitel starten</button></div>`;
  $('#restartBtn').onclick = () => { game = initialState(); world?.reset(); closeOverlay(); render(); };
  render();
}

function startCombat(kind, retreatField = FIELD_BY_ID[game.field].neighbors[0]) {
  if (combat || game.phase !== 'explore') return;
  game.phase = 'combat';
  render();
  $('#overlay').classList.remove('hidden');
  $('#overlay').innerHTML = `<div class="combat-modal"><div class="combat-header"><div><div class="eyebrow">GLOBALER KAMPF · ${kind === 'boss' ? 'FINALE' : 'BEGEGNUNG'}</div><h2>${kind === 'boss' ? 'Der Wächter des Turms' : kind === 'horde' ? 'Die wandernde Horde' : 'Späher im Nebelwald'}</h2></div><div class="combat-hud"><span>LEBEN <b id="combatHp">${game.hp}</b></span><span>PFEILE <b id="combatArrows">${game.arrows}</b></span><span>GEGNER <b id="enemyHp">—</b></span></div></div><div id="combatViewport"></div><div class="touch-controls"><div class="dpad"><button data-key="KeyW">▲</button><div><button data-key="KeyA">◀</button><button data-key="KeyS">▼</button><button data-key="KeyD">▶</button></div></div><div class="touch-actions"><button id="touchRoll">ROLLE</button><button id="touchFire">SCHUSS</button></div></div><div class="combat-foot"><span>WASD bewegen · Maus zielen · Linksklick schießen · Leertaste rollen</span><button id="retreatBtn">Rückzug zum Nachbarfeld</button><span id="combatHint">Bleibe in Bewegung.</span></div></div>`;
  combat = new CombatScene($('#combatViewport'), kind, outcome => {
    combat?.dispose(); combat = null;
    closeOverlay();
    if (outcome === 'retreat') {
      game.field = retreatField;
      game.marker = { x: FIELD_BY_ID[retreatField].x, y: FIELD_BY_ID[retreatField].y };
      world?.teleport(retreatField);
      game.phase = 'explore';
      toast('Du ziehst dich zurück. Der verbrauchte Reisepunkt bleibt verloren.');
    } else if (outcome === 'win') {
      game.hp = Math.max(1, game.hp);
      if (kind === 'scout') game.forestEnemyAlive = false;
      if (kind === 'horde') game.hordeIndex = 0;
      if (kind === 'boss') { game.bossAlive = false; return showEnding(true); }
      game.phase = 'explore'; toast('Gegner besiegt. Die Welt setzt sich wieder in Bewegung.');
    } else {
      dropOnDeath(game);
      game.field = 'castle'; game.phase = 'explore';
      const night = sleep(game);
      if (!night.ok) { game.day += 1; game.tp = MAX_TP; }
      game.hp = MAX_HP;
      game.marker = { x: FIELD_BY_ID.castle.x, y: FIELD_BY_ID.castle.y };
      world?.teleport('castle');
      game.claimed = {};
      if (game.phase === 'loss') return showEnding(false);
      toast('Du bist gefallen. Am nächsten Morgen erwachst du in der Burg; das Silberblatt liegt am Todesort.');
    }
    render();
  });
  $('#retreatBtn').onclick = () => combat?.finish('retreat');
  $('#touchRoll').onclick = () => combat?.roll();
  $('#touchFire').onclick = () => combat?.shoot();
  $('.touch-controls').querySelectorAll('[data-key]').forEach(button => {
    button.addEventListener('pointerdown', event => { event.preventDefault(); combat?.keys.add(button.dataset.key); });
    for (const name of ['pointerup', 'pointercancel', 'pointerleave']) button.addEventListener(name, () => combat?.keys.delete(button.dataset.key));
  });
}

class ExplorationWorld {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9eb9a7);
    this.scene.fog = new THREE.Fog(0x9eb9a7, 52, 145);
    this.camera = new THREE.PerspectiveCamera(57, 1, .1, 220);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    container.appendChild(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight(0xe6f0df, 0x53634e, 2.4));
    const sunlight = new THREE.DirectionalLight(0xffe2ab, 2.8);
    sunlight.position.set(-18, 35, -20); this.scene.add(sunlight);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(150, 120), new THREE.MeshStandardMaterial({ map: createGroundTexture(), roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -.08; this.scene.add(ground);
    this.ground = ground;
    this.makeWorld();
    this.hero = this.makeHero();
    this.hero.position.copy(worldPoint(FIELD_BY_ID.castle)).add(new THREE.Vector3(0,0,6));
    this.scene.add(this.hero);
    this.targetRing = new THREE.Mesh(new THREE.RingGeometry(.7, .86, 32), new THREE.MeshBasicMaterial({ color: 0xf7df95, transparent: true, opacity: .9, side: THREE.DoubleSide }));
    this.targetRing.rotation.x = -Math.PI / 2; this.targetRing.position.y = .06; this.targetRing.visible = false; this.scene.add(this.targetRing);
    this.route = [];
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.onClick = event => {
      if (game.phase !== 'explore' || !$('#overlay').classList.contains('hidden')) return;
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.raycaster.intersectObject(this.ground)[0];
      if (hit) this.moveTo(hit.point);
    };
    this.onResize = () => {
      const w = container.clientWidth, h = container.clientHeight;
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h);
    };
    this.renderer.domElement.addEventListener('pointerdown', this.onClick);
    window.addEventListener('resize', this.onResize);
    this.onResize();
    this.camera.position.copy(this.hero.position).add(new THREE.Vector3(0, 12.5, 17));
    this.camera.lookAt(this.hero.position.x, 0, this.hero.position.z - 4);
    this.frame();
  }
  add(mesh, x, y, z, parent = this.scene) { mesh.position.set(x, y, z); parent.add(mesh); return mesh; }
  mat(color, roughness = 1) { return new THREE.MeshStandardMaterial({ color, roughness }); }
  makeWorld() {
    const soil = this.mat(0xb59b6a), pale = this.mat(0xcabf8e), stone = this.mat(0x8d9690), roof = this.mat(0x5e5968), wood = this.mat(0x6d4e35);
    const flower = [this.mat(0xf5cd6d), this.mat(0xe6a8b0), this.mat(0xd3d8a1)];
    const seed = n => { const v = Math.sin(n * 57.23 + 13.7) * 43758.5453; return v - Math.floor(v); };
    // Each illustrated-map coordinate corresponds to the same coordinate in this playable world.
    for (const field of FIELDS) {
      const c = worldPoint(field);
      const regionColor = { castle: 0x8ca279, meadow: 0x97ad69, crossroads: 0x8b9b66, forest: 0x4f7857, marsh: 0x687f69, quarry: 0x9b9b85, river: 0x6f9a7f, watchtower: 0x777d77 }[field.id];
      const region = new THREE.Mesh(new THREE.CircleGeometry(field.id === 'watchtower' ? 8 : 10.4, 48), new THREE.MeshStandardMaterial({ color: regionColor, roughness: 1, transparent: true, opacity: .82 }));
      region.rotation.x = -Math.PI / 2; region.position.set(c.x, -.025, c.z); this.scene.add(region);
      const ring = new THREE.Mesh(new THREE.RingGeometry(10.25, 10.43, 48), new THREE.MeshBasicMaterial({ color: 0xe8d6a4, transparent: true, opacity: .38, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(c.x, .015, c.z); this.scene.add(ring);
      const label = this.makeLabel(field.name.toUpperCase()); label.position.set(c.x, 2.55, c.z); this.scene.add(label);
    }
    for (const field of FIELDS) for (const neighborId of field.neighbors) if (field.id < neighborId) {
      const a = worldPoint(field), b = worldPoint(FIELD_BY_ID[neighborId]);
      const direction = b.clone().sub(a), length = direction.length();
      const path = new THREE.Mesh(new THREE.BoxGeometry(3.7, .04, length), soil);
      path.rotation.y = Math.atan2(direction.x, direction.z);
      path.position.copy(a).addScaledVector(direction, .5); path.position.y = .018; this.scene.add(path);
      const crossing = a.clone().addScaledVector(direction, .5);
      const gate = new THREE.Mesh(new THREE.BoxGeometry(5.3, .12, .32), new THREE.MeshStandardMaterial({ color: 0xf0d994, emissive: 0x866329, emissiveIntensity: .25 }));
      gate.rotation.y = Math.atan2(direction.x, direction.z);
      gate.position.set(crossing.x, .08, crossing.z); this.scene.add(gate);
      for (const offset of [-2.6, 2.6]) {
        const perpendicular = new THREE.Vector3(direction.z, 0, -direction.x).normalize();
        const post = new THREE.Mesh(new THREE.CylinderGeometry(.15, .2, 1.3, 6), wood);
        post.position.copy(crossing).addScaledVector(perpendicular, offset); post.position.y = .65; this.scene.add(post);
      }
    }
    // Geographical landmarks echo the image-map: castle northwest, woods middle-east,
    // quarry south, river southeast, marsh east, watchtower northeast.
    const castle = worldPoint(FIELD_BY_ID.castle);
    this.add(new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.7, 3, 8), stone), castle.x, 1.5, castle.z - 2);
    for (const [dx, dz] of [[-3,-4],[3,-4],[-3,0],[3,0]]) {
      this.add(new THREE.Mesh(new THREE.CylinderGeometry(.8, 1.05, 6, 8), stone), castle.x+dx, 3, castle.z+dz);
      this.add(new THREE.Mesh(new THREE.ConeGeometry(1.23, 2.2, 8), roof), castle.x+dx, 7, castle.z+dz);
    }
    this.add(new THREE.Mesh(new THREE.ConeGeometry(3.5, 2.6, 8), roof), castle.x, 4.25, castle.z - 2);
    for (const side of [-1, 1]) {
      this.add(new THREE.Mesh(new THREE.BoxGeometry(.65, 2.2, .35), stone), castle.x + side * 1.55, 1.1, castle.z + 1.18);
      this.add(new THREE.Mesh(new THREE.BoxGeometry(1.05, .45, .42), stone), castle.x + side * 1.55, 2.3, castle.z + 1.18);
      this.add(new THREE.Mesh(new THREE.BoxGeometry(.65, 1.05, .12), wood), castle.x + side * .34, .54, castle.z + 1.42);
    }
    const castleFlag = this.add(new THREE.Mesh(new THREE.BoxGeometry(.08, 2.5, .08), stone), castle.x, 6.4, castle.z - 2);
    this.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, .62, .06), this.mat(0xbc7650)), castleFlag.position.x + .62, 7.2, castleFlag.position.z);
    const tower = worldPoint(FIELD_BY_ID.watchtower);
    this.add(new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.75, 9, 8), stone), tower.x, 4.5, tower.z-2);
    this.add(new THREE.Mesh(new THREE.ConeGeometry(2.15, 3.5, 8), this.mat(0x3f3a4d)), tower.x, 10.7, tower.z-2);
    const evil = new THREE.PointLight(0xd7666a, 7, 13); evil.position.set(tower.x, 8, tower.z-2); this.scene.add(evil);
    const forest = worldPoint(FIELD_BY_ID.forest), meadow = worldPoint(FIELD_BY_ID.meadow), marsh = worldPoint(FIELD_BY_ID.marsh), river = worldPoint(FIELD_BY_ID.river), quarry = worldPoint(FIELD_BY_ID.quarry);
    const treeAt = (x,z,size=1,dark=false) => {
      const variety = Math.floor(seed(x * 3 + z) * 3);
      const kind = dark ? 'dark-pine' : variety === 0 ? 'broadleaf' : 'pine';
      const tree = createTree(kind, size, variety);
      tree.rotation.y = seed(z * 7 + x) * Math.PI * 2;
      tree.position.set(x, 0, z); this.scene.add(tree);
    };
    for (let i=0;i<48;i++) {
      const angle = seed(i+11)*Math.PI*2, radius = 3.4 + seed(i+143)*8.7;
      treeAt(forest.x+Math.cos(angle)*radius, forest.z+Math.sin(angle)*radius, .65+seed(i+260)*.8, true);
    }
    for (let i=0;i<22;i++) {
      const a=seed(i+501)*Math.PI*2, r=4+seed(i+703)*9;
      treeAt(meadow.x+Math.cos(a)*r, meadow.z+Math.sin(a)*r, .5+seed(i+901)*.45);
    }
    for (let i=0;i<54;i++) {
      const a=seed(i+1001)*Math.PI*2, r=3.6+seed(i+1101)*9.2;
      const x=meadow.x+Math.cos(a)*r, z=meadow.z+Math.sin(a)*r;
      this.add(new THREE.Mesh(new THREE.CylinderGeometry(.025,.035,.48,4), this.mat(0x59794a)),x,.24,z);
      this.add(new THREE.Mesh(new THREE.IcosahedronGeometry(.11,0),flower[i%3]),x,.51,z);
    }
    for (let i=0;i<10;i++) {
      const a=seed(i+1201)*Math.PI*2, r=5+seed(i+1301)*6;
      const x=forest.x+Math.cos(a)*r, z=forest.z+Math.sin(a)*r;
      const stump=this.add(new THREE.Mesh(new THREE.CylinderGeometry(.27,.36,.46,7),wood),x,.23,z);
      stump.rotation.y=a;
      if (i%2===0) {
        this.add(new THREE.Mesh(new THREE.ConeGeometry(.21,.29,7),this.mat(0xb67961)),x+.5,.34,z+.2);
        this.add(new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,.22,5),pale),x+.5,.13,z+.2);
      }
    }
    for (let i=0;i<11;i++) {
      const x=marsh.x+(seed(i+601)-.5)*17, z=marsh.z+(seed(i+809)-.5)*14;
      const pool = new THREE.Mesh(new THREE.CircleGeometry(1.1+seed(i+43)*1.2,20), new THREE.MeshStandardMaterial({ color: 0x476e6d, metalness: .2, roughness: .25 }));
      pool.rotation.x=-Math.PI/2; pool.position.set(x,.035,z); this.scene.add(pool);
    }
    for (let i=0;i<26;i++) {
      const x=marsh.x+(seed(i+1401)-.5)*18, z=marsh.z+(seed(i+1501)-.5)*15;
      this.add(new THREE.Mesh(new THREE.CylinderGeometry(.035,.055,.9,4),this.mat(0x7b8052)),x,.45,z);
      this.add(new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,.28,5),this.mat(0x544536)),x,1,z);
    }
    for (let i=0;i<28;i++) {
      const x=quarry.x+(seed(i+83)-.5)*19, z=quarry.z+(seed(i+128)-.5)*17;
      const rock = this.add(new THREE.Mesh(new THREE.IcosahedronGeometry(.5+seed(i+218)*1.2,0), stone),x,.2,z);
      rock.rotation.set(seed(i+5),seed(i+4),seed(i+3));
    }
    for (let i=0;i<6;i++) {
      const x=quarry.x-5+i*1.5, z=quarry.z-3+(i%2)*1.2;
      this.add(new THREE.Mesh(new THREE.BoxGeometry(1.2,.46,.75),pale),x,.23,z);
    }
    for (let i=0;i<12;i++) {
      const water = new THREE.Mesh(new THREE.PlaneGeometry(1.9,2.9), new THREE.MeshStandardMaterial({ color: 0x5c9caa, metalness:.25, roughness:.35, transparent:true, opacity:.87 }));
      water.rotation.x=-Math.PI/2; water.rotation.z=.15; water.position.set(river.x-5+i*.88,.045,river.z-2+i*.25); this.scene.add(water);
    }
    for (let i=0;i<7;i++) {
      this.add(new THREE.Mesh(new THREE.BoxGeometry(.55,.16,2.45),wood),river.x-1.4+i*.49,.2,river.z-1.2);
    }
    const leaf = this.add(new THREE.Mesh(new THREE.IcosahedronGeometry(.55,1), new THREE.MeshStandardMaterial({ color: 0xe6d675, emissive:0xcfa954, emissiveIntensity:1.3 })),river.x+1,1.2,river.z-1);
    const questLight = new THREE.PointLight(0xffe580,3.5,8); questLight.position.copy(leaf.position); this.scene.add(questLight);
    for (const fieldId of ['meadow','crossroads','quarry']) {
      const c=worldPoint(FIELD_BY_ID[fieldId]);
      const base=this.add(new THREE.Mesh(new THREE.BoxGeometry(2.8,2,2.4), this.mat(0xb2a484)),c.x+3,1,c.z+3);
      const hutRoof=this.add(new THREE.Mesh(new THREE.ConeGeometry(2.2,2,4), roof),c.x+3,2.9,c.z+3); hutRoof.rotation.y=Math.PI/4;
    }
  }
  makeLabel(value) {
    const canvas=document.createElement('canvas'); canvas.width=512; canvas.height=96;
    const ctx=canvas.getContext('2d'); ctx.fillStyle='#12241fcb'; ctx.roundRect(0,0,512,96,18); ctx.fill();
    ctx.font='bold 31px sans-serif'; ctx.textAlign='center'; ctx.fillStyle='#f8ebc4'; ctx.fillText(value,256,60);
    const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false})); sprite.scale.set(8,1.5,1); return sprite;
  }
  makeHero() { return createArcher({ groundMarker: true }); }
  moveTo(target) {
    if (game.phase !== 'explore') return;
    const destination=fieldAt(target);
    $('#worldPrompt').classList.add('dismissed');
    const path=shortestPath(game.field,destination.id);
    if (!path) return toast('Dorthin gibt es noch keinen Weg.');
    if (path.length-1>game.tp) return toast(`Für ${destination.name} brauchst du ${path.length-1} Reisepunkte. Du hast ${game.tp}.`);
    this.route=[];
    for (let i=1;i<path.length;i++) {
      const from=worldPoint(FIELD_BY_ID[path[i-1]]), to=worldPoint(FIELD_BY_ID[path[i]]);
      // The glowing gate halfway along each road is the real field boundary.
      const crossing=from.clone().lerp(to,.51);
      this.route.push({point:crossing,enter:path[i],from:path[i-1]});
    }
    const final=target.clone(); final.y=0;
    const center=worldPoint(destination);
    const offset=final.clone().sub(center);
    if (offset.length()>9.7) final.copy(center).addScaledVector(offset.normalize(),9.7);
    this.route.push({point:final});
    this.targetRing.position.set(final.x,.06,final.z); this.targetRing.visible=true;
    $('#destinationLabel').textContent=destination.name.toUpperCase();
    toast(destination.id===game.field ? `Laufe innerhalb von ${destination.name}.` : `Route: ${path.map(id=>FIELD_BY_ID[id].name).join(' → ')}`);
  }
  teleport(id) {
    this.route=[]; this.targetRing.visible=false;
    this.hero.position.copy(worldPoint(FIELD_BY_ID[id]));
    if (id === 'castle') this.hero.position.z += 6;
    $('#destinationLabel').textContent=FIELD_BY_ID[id].name.toUpperCase();
    this.updateMarker();
  }
  reset() { this.teleport('castle'); }
  updateMarker() {
    const marker=$('#playerMarker');
    if (marker) marker.setAttribute('transform',`translate(${(this.hero.position.x/1.32+50)*10},${(this.hero.position.z/1.12+50)*6.67})`);
  }
  frame = () => {
    this.raf=requestAnimationFrame(this.frame);
    const dt=Math.min(.05,this.clock.getDelta());
    if (game.phase==='explore' && this.route.length && $('#overlay').classList.contains('hidden')) {
      const step=this.route[0], delta=step.point.clone().sub(this.hero.position); delta.y=0;
      const distance=delta.length();
      if (distance<.15) {
        this.hero.position.copy(step.point); this.route.shift();
        if (step.enter) {
          const result=travel(game,step.enter);
          if (!result.ok) {this.route=[]; this.targetRing.visible=false; toast(result.reason);}
          else {enteredField(step.enter,step.from); if (game.phase!=='explore') this.route=[];}
        }
        if (!this.route.length) this.targetRing.visible=false;
      } else {
        const stride=Math.min(distance,dt*8.2); this.hero.position.addScaledVector(delta.normalize(),stride);
        this.hero.rotation.y=Math.atan2(delta.x,delta.z);
        this.hero.userData.walk.position.y=Math.sin(performance.now()*.012)*.055;
      }
      this.updateMarker();
    }
    const desired=this.hero.position.clone().add(new THREE.Vector3(0,12.5,17));
    this.camera.position.lerp(desired,Math.min(1,dt*4));
    this.camera.lookAt(this.hero.position.x,0,this.hero.position.z-4);
    this.renderer.render(this.scene,this.camera);
  };
  dispose() { cancelAnimationFrame(this.raf); this.renderer.domElement.removeEventListener('pointerdown',this.onClick); window.removeEventListener('resize',this.onResize); this.renderer.dispose(); this.container.replaceChildren(); }
}

class CombatScene {
  constructor(container, kind, complete) {
    this.container = container; this.kind = kind; this.complete = complete; this.keys = new Set(); this.projectiles = [];
    this.hero = new THREE.Vector3(0, 0, 6); this.enemy = new THREE.Vector3(0, 0, -6);
    this.enemyHealth = kind === 'boss' ? 10 : kind === 'horde' ? 7 : 5;
    this.rollUntil = 0; this.invulnUntil = 0; this.cooldownUntil = 0; this.enemyAttackAt = 0;
    this.pointer = { x: 0, y: 0 }; this.ended = false;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(kind === 'boss' ? 0x17151a : 0x101e1d);
    this.scene.fog = new THREE.Fog(this.scene.background, 13, 42);
    const w = container.clientWidth, h = container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(63, w / h, 0.1, 100);
    this.camera.position.set(0, 5.2, 14.6);
    this.camera.lookAt(0, 1.1, 1.8);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); this.renderer.setSize(w, h);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; container.appendChild(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight(0xbfe6e0, 0x313a2f, 2));
    const sun = new THREE.DirectionalLight(0xffd69a, 2.5); sun.position.set(-6, 12, 8); this.scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: kind === 'boss' ? 0x302c30 : 0x314d3e, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.08; this.scene.add(ground);
    const ring = new THREE.Mesh(new THREE.RingGeometry(12, 12.25, 64), new THREE.MeshBasicMaterial({ color: 0xc9ad76, side: THREE.DoubleSide, transparent: true, opacity: .65 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .02; this.scene.add(ring);
    this.makeEnvironment(kind);
    this.heroGroup = createArcher();
    this.scene.add(this.heroGroup);
    this.enemyGroup = createEnemy(kind);
    const glow = new THREE.PointLight(0xff6c54, 2.4, 6); glow.position.y = 1.5; this.enemyGroup.add(glow);
    this.scene.add(this.enemyGroup);
    this.aimMarker = new THREE.Mesh(new THREE.RingGeometry(.22, .28, 24), new THREE.MeshBasicMaterial({ color: 0xffdf90, side: THREE.DoubleSide })); this.aimMarker.rotation.x = -Math.PI/2; this.aimMarker.position.y = .05; this.scene.add(this.aimMarker);
    $('#enemyHp').textContent = this.enemyHealth;
    this.clock = new THREE.Clock();
    this.onKeyDown = e => { if (['KeyW','KeyA','KeyS','KeyD','Space'].includes(e.code)) { e.preventDefault(); this.keys.add(e.code); if (e.code === 'Space') this.roll(); } };
    this.onKeyUp = e => this.keys.delete(e.code);
    this.onMove = e => { const rect = this.renderer.domElement.getBoundingClientRect(); this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1; this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1; };
    this.onShoot = e => { e.preventDefault(); this.shoot(); };
    this.onResize = () => { if (!container.isConnected) return; const w = container.clientWidth, h = container.clientHeight; this.camera.aspect = w/h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w,h); };
    window.addEventListener('keydown', this.onKeyDown); window.addEventListener('keyup', this.onKeyUp); window.addEventListener('resize', this.onResize);
    this.renderer.domElement.addEventListener('pointermove', this.onMove); this.renderer.domElement.addEventListener('pointerdown', this.onShoot);
    this.frame();
  }
  makeEnvironment(kind) {
    for (let i = 0; i < 28; i++) {
      const angle = i * Math.PI * 2 / 28, radius = 15 + (i % 3) * 1.3;
      const tree = createTree(kind === 'boss' ? 'dark-pine' : i % 5 === 0 ? 'broadleaf' : 'pine', .78 + (i % 4) * .09, i % 3);
      tree.position.set(Math.cos(angle)*radius, 0, Math.sin(angle)*radius); this.scene.add(tree);
    }
    for (let i = 0; i < 14; i++) {
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(.3 + (i%3)*.13, 0), new THREE.MeshStandardMaterial({ color: 0x858478 }));
      rock.position.set(Math.cos(i*2.39)*(9+i%4), .12, Math.sin(i*2.39)*(9+i%4)); this.scene.add(rock);
    }
  }
  roll() {
    const now = performance.now(); if (now < this.rollUntil + 950) return;
    this.rollUntil = now + 330; this.invulnUntil = now + 570; this.inaccurateUntil = now + 1100;
    $('#combatHint').textContent = 'Rolle! Der nächste Schuss ist kurz unpräzise.';
  }
  shoot() {
    const now = performance.now(); if (this.ended || now < this.cooldownUntil) return;
    if (game.arrows <= 0) { $('#combatHint').textContent = 'Keine Pfeile mehr!'; return; }
    this.cooldownUntil = now + 340; game.arrows--; $('#combatArrows').textContent = game.arrows;
    const target = this.aimPoint();
    const direction = target.clone().sub(this.hero).setY(0).normalize();
    if (now < this.inaccurateUntil) direction.applyAxisAngle(new THREE.Vector3(0,1,0), (Math.random()-.5)*.65);
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(.09, .58, 6), new THREE.MeshBasicMaterial({ color: 0xffd681 })); mesh.rotation.x = Math.PI/2;
    mesh.position.copy(this.hero).addScaledVector(direction, .7); mesh.position.y = 1.15; mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), direction);
    this.scene.add(mesh); this.projectiles.push({ mesh, direction, born: now });
  }
  aimPoint() {
    const ray = new THREE.Raycaster(); ray.setFromCamera(this.pointer, this.camera);
    const target = new THREE.Vector3();
    ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0), 0), target);
    if (!Number.isFinite(target.x)) target.set(this.enemy.x, 0, this.enemy.z);
    // Subtle aim assist: only pulls shots slightly when the cursor is already near the target.
    if (target.distanceTo(this.enemy) < 2.1) target.lerp(this.enemy, .25);
    return target;
  }
  frame = () => {
    if (this.ended) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(.04, this.clock.getDelta()), now = performance.now();
    const motion = new THREE.Vector3((this.keys.has('KeyD')?1:0)-(this.keys.has('KeyA')?1:0),0,(this.keys.has('KeyS')?1:0)-(this.keys.has('KeyW')?1:0));
    if (motion.lengthSq()) { motion.normalize().multiplyScalar(dt * (now < this.rollUntil ? 15 : 6.1)); this.hero.add(motion); this.hero.x = THREE.MathUtils.clamp(this.hero.x,-11,11); this.hero.z = THREE.MathUtils.clamp(this.hero.z,-11,11); }
    this.heroGroup.position.copy(this.hero);
    const aim = this.aimPoint(); this.heroGroup.rotation.y = Math.atan2(aim.x-this.hero.x, aim.z-this.hero.z);
    this.aimMarker.position.x = aim.x; this.aimMarker.position.z = aim.z;
    const chase = this.hero.clone().sub(this.enemy); chase.y = 0;
    if (chase.length() > 2.5) this.enemy.addScaledVector(chase.normalize(), dt * (this.kind === 'boss' ? 2.6 : 1.8));
    else if (now > this.enemyAttackAt) {
      this.enemyAttackAt = now + (this.kind === 'boss' ? 1200 : 1800);
      if (now > this.invulnUntil) { game.hp = Math.max(0, game.hp - (this.kind === 'boss' ? 15 : 9)); $('#combatHp').textContent = game.hp; $('#combatHint').textContent = 'Treffer! Rolle im richtigen Moment aus der Reichweite.'; if (game.hp === 0) return this.finish('dead'); }
    }
    this.enemyGroup.position.copy(this.enemy);
    this.enemyGroup.rotation.y = Math.atan2(this.hero.x-this.enemy.x, this.hero.z-this.enemy.z);
    for (const projectile of [...this.projectiles]) {
      projectile.mesh.position.addScaledVector(projectile.direction, dt*24);
      if (projectile.mesh.position.distanceTo(this.enemy.clone().setY(1.15)) < (this.kind === 'boss' ? 1.5 : 1.05)) {
        this.enemyHealth--; $('#enemyHp').textContent = this.enemyHealth; this.scene.remove(projectile.mesh); this.projectiles.splice(this.projectiles.indexOf(projectile),1);
        $('#combatHint').textContent = 'Treffer! Bleibe auf Abstand.';
        if (this.enemyHealth <= 0) return this.finish('win');
      } else if (now - projectile.born > 1800) { this.scene.remove(projectile.mesh); this.projectiles.splice(this.projectiles.indexOf(projectile),1); }
    }
    this.camera.position.lerp(new THREE.Vector3(this.hero.x, 5.2, this.hero.z+8.6), Math.min(1,dt*6));
    this.camera.lookAt(this.hero.x, 1.1, this.hero.z-4.2);
    this.renderer.render(this.scene, this.camera);
  };
  finish(result) { if (this.ended) return; this.ended = true; setTimeout(() => this.complete(result), 450); }
  dispose() { this.ended = true; cancelAnimationFrame(this.raf); window.removeEventListener('keydown',this.onKeyDown); window.removeEventListener('keyup',this.onKeyUp); window.removeEventListener('resize',this.onResize); this.renderer.domElement.removeEventListener('pointermove',this.onMove); this.renderer.domElement.removeEventListener('pointerdown',this.onShoot); this.renderer.dispose(); this.container.replaceChildren(); }
}

world = new ExplorationWorld($('#worldViewport'));
render();
