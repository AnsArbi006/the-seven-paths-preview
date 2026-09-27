import * as THREE from 'three';
import { MAX_TP, MAX_HP, BASE_CASTLE_HITS, FIELDS, FIELD_BY_ID, HORDE_ROUTE, initialState, travel, canSleep, sleep, buy, dropOnDeath } from './rules.js';
import './style.css';

const app = document.querySelector('#app');
let game = initialState();
let combat = null;
const fieldIcons = { castle: '♜', meadow: '✦', crossroads: '✣', forest: '♠', marsh: '◈', quarry: '◆', river: '≈', watchtower: '♜' };

app.innerHTML = `
  <header class="topbar">
    <div class="brand"><div class="brand-mark">✦</div><div><strong>THE SEVEN PATHS</strong><small>SPIELBARER KONZEPTSTAND · KAPITEL I</small></div></div>
    <div class="top-actions"><span class="pill subtle">Einzelspieler-Vorschau</span><button id="guideBtn" class="text-button">Spielanleitung ↗</button></div>
  </header>
  <main>
    <section class="intro"><div class="eyebrow">KÖNIGREICH ELDERVALE · PROTOTYP 0.1</div><h1>Sieben Wege.<br><em>Ein Königreich.</em></h1><p>Bewege dich über die Felder, halte die Horde von der Burg fern und finde das Silberblatt. Ein erster spielbarer Blick auf die Regeln von <i>The Seven Paths</i>.</p></section>
    <section class="game-shell">
      <div class="map-card">
        <div class="map-topline"><span><span class="live-dot"></span> WELTKARTE</span><span id="phaseLabel">ERKUNDUNG</span></div>
        <div class="map-frame" id="mapFrame"><img src="./assets/seven-paths-map.png" alt="Illustrierte Fantasywelt mit Burg, Wald, Fluss, Sumpf und Wachturm"/><svg id="mapSvg" viewBox="0 0 1000 667" preserveAspectRatio="xMidYMid meet" aria-label="Interaktive Karte"></svg><div class="map-vignette"></div></div>
        <div class="map-footer"><span><span class="legend-dot player"></span> Bogenschütze</span><span><span class="legend-dot enemy"></span> Horde / Gegner</span><span><span class="legend-dot quest"></span> Questziel</span><span class="map-hint">Feld anklicken = reisen · Im aktuellen Feld klicken = frei bewegen</span></div>
      </div>
      <aside class="sidebar">
        <div class="hero-card"><div class="hero-portrait">🏹</div><div><div class="eyebrow">DEIN HELD</div><h2>Der Bogenschütze</h2><p>Schnell. Wendiger Fernkampf. Eine Rolle rettet dich, macht den nächsten Schuss aber unpräzise.</p></div></div>
        <div class="stat-grid"><div class="stat"><small>TAG</small><strong id="dayStat">01</strong></div><div class="stat"><small>REISEPUNKTE</small><strong id="tpStat">7 <span>/ 7</span></strong></div><div class="stat"><small>LEBEN</small><strong id="hpStat">100</strong></div><div class="stat"><small>PFEILE</small><strong id="arrowStat">12</strong></div></div>
        <div class="card section-card"><div class="card-heading"><span>AKTUELLER ORT</span><span id="locationIcon">♜</span></div><h3 id="locationName">Königsburg</h3><p id="locationText"></p><div id="locationActions" class="action-list"></div></div>
        <div class="card section-card quest-card"><div class="card-heading"><span>HAUPTQUEST</span><span class="tiny-badge">AKTIV</span></div><h3>Das Silberblatt</h3><p id="questText">Ein seltenes Blatt wächst am Flussufer. Bringe es zur Burg und stelle dich der Macht am Wachturm.</p><div id="questProgress" class="quest-progress"></div></div>
        <div class="card section-card threat-card"><div class="card-heading"><span>BURG & BEDROHUNG</span><span id="threatLabel">Horde am Wachturm</span></div><div class="meter"><div id="castleMeter"></div></div><div class="threat-row"><span id="castleText"></span><span id="goldText"></span></div><p class="small" id="routeText"></p></div>
        <button id="sleepBtn" class="primary-btn">✦ &nbsp; Tag beenden</button><p class="small footnote" id="sleepHint">Schlafen ist nur in gegnerfreien Feldern möglich.</p>
      </aside>
    </section>
    <section class="below"><div><div class="eyebrow">DEIN ZIEL</div><h2>Die Welt bewegt sich, auch wenn du ruhst.</h2></div><p>Jede Nacht rückt die Horde ein Feld Richtung Burg vor. Planung schlägt Tempo: Sieben Reisepunkte pro Tag, keine angesparten Punkte. Ein Schild aus dem Burgshop fängt einen zusätzlichen Angriff ab.</p></section>
  </main>
  <div id="toast" role="status" aria-live="polite"></div>
  <div id="overlay" class="overlay hidden" role="dialog" aria-modal="true"></div>
`;

const $ = selector => document.querySelector(selector);
const esc = str => String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const point = field => ({ x: field.x * 10, y: field.y * 6.67 });
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 3700); }

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
    return `<g class="field ${active ? 'active' : ''} ${reachable ? 'reachable' : ''}" data-field="${f.id}" tabindex="0" role="button" aria-label="${esc(f.name)}${reachable ? ', erreichbar' : ''}"><circle class="field-ring" cx="${p.x}" cy="${p.y}" r="${active ? 30 : 27}"/><circle class="field-core" cx="${p.x}" cy="${p.y}" r="20"/><text class="field-icon" x="${p.x}" y="${p.y + 6}">${fieldIcons[f.id]}</text><text class="field-name" x="${p.x}" y="${p.y + 47}">${esc(f.name)}</text>${enemy ? `<circle class="enemy-indicator" cx="${p.x + 21}" cy="${p.y - 21}" r="8"/>` : ''}${quest ? `<circle class="quest-indicator" cx="${p.x - 21}" cy="${p.y - 21}" r="8"/>` : ''}</g>`;
  }).join('');
  $('#mapSvg').innerHTML = `<polyline class="horde-route" points="${routeLine}"/>${edges.join('')}${nodes}<g class="player-marker" transform="translate(${game.marker.x * 10},${game.marker.y * 6.67})"><circle r="11"/><path d="M0,-16 L8,2 L0,-3 L-8,2 Z"/></g>`;
  $('#mapSvg').querySelectorAll('.field').forEach(node => {
    node.addEventListener('click', event => { event.stopPropagation(); chooseField(node.dataset.field); });
    node.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); chooseField(node.dataset.field); } });
  });
}

function chooseField(id) {
  if (game.phase !== 'explore') return;
  if (id === game.field) { toast('Klicke auf die Karte nahe deinem Feld, um dich darin frei zu bewegen.'); return; }
  const origin = game.field;
  const result = travel(game, id);
  if (!result.ok) { toast(result.reason); return; }
  if (id === 'forest' && game.forestEnemyAlive) { startCombat('scout', origin); return; }
  if (id === HORDE_ROUTE[game.hordeIndex] && game.hordeIndex > 0) { startCombat('horde', origin); return; }
  if (id === 'watchtower' && game.bossAlive && game.questItem) { startCombat('boss', origin); return; }
  if (id === 'watchtower' && !game.questItem) toast('Der Wachturm bleibt verschlossen, bis du das Silberblatt besitzt.');
  else toast(`Du erreichst ${FIELD_BY_ID[id].name}. Ein Reisepunkt verbraucht.`);
  render();
}

$('#mapSvg').addEventListener('click', event => {
  if (game.phase !== 'explore') return;
  const rect = event.currentTarget.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width * 100;
  const y = (event.clientY - rect.top) / rect.height * 100;
  const center = FIELD_BY_ID[game.field];
  if (Math.hypot((x - center.x) * 1.5, y - center.y) > 13) { toast('Bleibe für freie Bewegung im aktuellen Feld. Für Reisen klicke einen benachbarten Feldmarker.'); return; }
  game.marker = { x, y };
  renderMap();
});

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
  const result = sleep(game);
  if (!result.ok) { toast(result.reason); return; }
  if (game.phase === 'loss') return showEnding(false);
  toast(result.morningDamage ? `Tag ${game.day}: Ein Gegner auf deiner Route traf dich beim Erwachen (${result.morningDamage} Schaden).` : `Tag ${game.day} beginnt. Die Horde ist weitergezogen.`);
  if (HORDE_ROUTE[game.hordeIndex] === game.field && game.hordeIndex > 0) startCombat('horde');
  render();
});

$('#guideBtn').addEventListener('click', () => {
  $('#overlay').classList.remove('hidden');
  $('#overlay').innerHTML = `<div class="modal guide"><button class="close" id="closeOverlay" aria-label="Schließen">×</button><div class="eyebrow">SO SPIELST DU</div><h2>Erkunden. Planen. Kämpfen.</h2><div class="guide-grid"><div><strong>01 · Reisen</strong><p>Klicke ein benachbartes Feld. Jeder Wechsel kostet einen von sieben Reisepunkten. Zurückreisen kostet ebenfalls einen. Im aktuellen Feld ist das Bewegen frei.</p></div><div><strong>02 · Rasten</strong><p>Nur gegnerfreie Felder erlauben Schlaf. Der Tag endet; ungenutzte Punkte verfallen. Die Horde zieht nachts entlang der roten Route zur Burg.</p></div><div><strong>03 · Kämpfen</strong><p>Im Kampf: WASD bewegen, Maus zielen, Linksklick schießen, Leertaste rollen. Der Schuss unmittelbar nach einer Rolle streut. Pfeile sind begrenzt.</p></div><div><strong>04 · Gewinnen</strong><p>Finde das Silberblatt am Flussufer und besiege den Wächter am Wachturm. Die Burg fällt nach drei Treffern, plus einem weiteren pro gekauftem Schild.</p></div></div><p class="modal-note">Dieser Web-Prototyp ist eine Einzelspieler-Vorschau. Steam-Lobbys, Einladungen, Handel und echte Mehrspieler-Kämpfe folgen im Unity-Spiel.</p><button class="primary-btn" id="closeGuide">Verstanden</button></div>`;
  $('#closeOverlay').onclick = closeOverlay; $('#closeGuide').onclick = closeOverlay;
});
function closeOverlay() { $('#overlay').classList.add('hidden'); $('#overlay').innerHTML = ''; }
function render() { renderMap(); renderSidebar(); }

function showEnding(won) {
  combat?.dispose(); combat = null;
  game.phase = won ? 'victory' : 'loss';
  $('#overlay').classList.remove('hidden');
  $('#overlay').innerHTML = `<div class="modal ending"><div class="eyebrow">${won ? 'KAPITEL GESCHAFFT' : 'KAPITEL VERLOREN'}</div><h2>${won ? 'Ein Weg durch die Dunkelheit.' : 'Die Burg ist gefallen.'}</h2><p>${won ? 'Der Wächter ist besiegt und das Silberblatt gerettet. Du hast den ersten Prototyp durchgespielt.' : esc(game.result || 'Die Horde hat die Verteidigung überwunden.')}</p><button id="restartBtn" class="primary-btn">Neues Kapitel starten</button></div>`;
  $('#restartBtn').onclick = () => { game = initialState(); closeOverlay(); render(); };
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
    this.heroGroup = new THREE.Group();
    const cloak = new THREE.Mesh(new THREE.ConeGeometry(.57, 1.5, 8), new THREE.MeshStandardMaterial({ color: 0x5d9576, roughness: .85 })); cloak.position.y = .88; this.heroGroup.add(cloak);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.32, 12, 8), new THREE.MeshStandardMaterial({ color: 0xe0c29d })); head.position.y = 1.72; this.heroGroup.add(head);
    const bow = new THREE.Mesh(new THREE.TorusGeometry(.53, .055, 8, 20, Math.PI), new THREE.MeshStandardMaterial({ color: 0x8e5934 })); bow.position.set(.45, 1.1, -.1); bow.rotation.y = Math.PI/2; this.heroGroup.add(bow);
    this.scene.add(this.heroGroup);
    this.enemyGroup = new THREE.Group();
    const enemyBody = new THREE.Mesh(new THREE.IcosahedronGeometry(kind === 'boss' ? 1.45 : 1.05, 1), new THREE.MeshStandardMaterial({ color: kind === 'boss' ? 0x945260 : 0x9d6150, roughness: .7 })); enemyBody.position.y = kind === 'boss' ? 1.65 : 1.15; this.enemyGroup.add(enemyBody);
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
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3e332a });
    const leafMat = new THREE.MeshStandardMaterial({ color: kind === 'boss' ? 0x4d525a : 0x385c46 });
    for (let i = 0; i < 28; i++) {
      const angle = i * Math.PI * 2 / 28, radius = 15 + (i % 3) * 1.3;
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.17, .25, 2, 6), trunkMat); trunk.position.y = 1; tree.add(trunk);
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3.3, 7), leafMat); leaves.position.y = 3; tree.add(leaves);
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
    if (chase.length() > 2) this.enemy.addScaledVector(chase.normalize(), dt * (this.kind === 'boss' ? 2.6 : 1.8));
    else if (now > this.enemyAttackAt) {
      this.enemyAttackAt = now + (this.kind === 'boss' ? 1200 : 1800);
      if (now > this.invulnUntil) { game.hp = Math.max(0, game.hp - (this.kind === 'boss' ? 15 : 9)); $('#combatHp').textContent = game.hp; $('#combatHint').textContent = 'Treffer! Rolle im richtigen Moment aus der Reichweite.'; if (game.hp === 0) return this.finish('dead'); }
    }
    this.enemyGroup.position.copy(this.enemy); this.enemyGroup.rotation.y += dt*.4;
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

render();
