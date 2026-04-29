
// ============================
// DATA STRUCTURES
// ============================

class PriorityQueue {
  constructor() { this.heap = []; }

  enqueue(item) {
    this.heap.push(item);
    this._bubbleUp(this.heap.length - 1);
  }

  dequeue() {
    if (this.isEmpty()) return null;
    const top = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  peek() { return this.heap[0] || null; }
  isEmpty() { return this.heap.length === 0; }
  size() { return this.heap.length; }

  _bubbleUp(idx) {
    while (idx > 0) {
      const parent = Math.floor((idx - 1) / 2);
      if (this.heap[parent].priority >= this.heap[idx].priority) break;
      [this.heap[parent], this.heap[idx]] = [this.heap[idx], this.heap[parent]];
      idx = parent;
    }
  }

  _sinkDown(idx) {
    const n = this.heap.length;
    while (true) {
      let largest = idx;
      const l = 2 * idx + 1, r = 2 * idx + 2;
      if (l < n && this.heap[l].priority > this.heap[largest].priority) largest = l;
      if (r < n && this.heap[r].priority > this.heap[largest].priority) largest = r;
      if (largest === idx) break;
      [this.heap[largest], this.heap[idx]] = [this.heap[idx], this.heap[largest]];
      idx = largest;
    }
  }
}

class Queue {
  constructor() { this.items = []; }
  enqueue(item) { this.items.push(item); }
  dequeue() { return this.items.shift() || null; }
  peek() { return this.items[0] || null; }
  isEmpty() { return this.items.length === 0; }
  size() { return this.items.length; }
}

// ============================
// SIMULATION STATE
// ============================

const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');

let pq = new PriorityQueue();   // emergency vehicles
let nq = new Queue();           // normal vehicles
let activeVehicles = [];        // vehicles on road
let clearedCount = 0;
let emergencyCount = 0;
let totalSpawned = 0;
let simSpeed = 1;
let paused = false;
let autoSpawnOn = false;
let autoSpawnTimer = 0;
let idCounter = 0;
let lightState = 'green'; // green, yellow, red
let lightTimer = 0;
let lightDurations = { green: 180, yellow: 40, red: 120 };
let processingTimer = 0;
let processInterval = 120; // frames between processing next vehicle

const VEHICLE_TYPES = {
  car:       { emoji: '🚗', color: '#00ff88', speed: 2.2, width: 32, height: 20, label: 'CAR' },
  truck:     { emoji: '🚚', color: '#44aaff', speed: 1.5, width: 42, height: 24, label: 'TRUCK' },
  ambulance: { emoji: '🚑', color: '#ff3c3c', speed: 3.5, width: 36, height: 20, label: 'AMBULANCE', priority: 10 },
  fire:      { emoji: '🚒', color: '#ff6600', speed: 3.2, width: 40, height: 22, label: 'FIRE TRUCK', priority: 9 },
  police:    { emoji: '🚓', color: '#ff44ff', speed: 3.8, width: 34, height: 20, label: 'POLICE', priority: 8 },
};

const LANES = [0.3, 0.5, 0.7]; // Y-position ratios

function resize() {
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
}
resize();
window.addEventListener('resize', resize);

function makeId() { return ++idCounter; }

function makeVehicle(type) {
  const def = VEHICLE_TYPES[type];
  const lane = LANES[Math.floor(Math.random() * LANES.length)];
  return {
    id: makeId(),
    type,
    emoji: def.emoji,
    color: def.color,
    speed: def.speed * (0.85 + Math.random() * 0.3),
    width: def.width,
    height: def.height,
    label: def.label,
    priority: def.priority || 0,
    x: -60,
    y: 0,
    lane,
    active: false,
    cleared: false,
    flash: 0,
    trail: [],
  };
}

// ============================
// QUEUE OPERATIONS
// ============================

function addNormalVehicle(type = 'car') {
  const v = makeVehicle(type);
  nq.enqueue(v);
  totalSpawned++;
  log(`[QUEUED] ${v.emoji} ${v.label} #${v.id} → Normal Queue`, 'normal');
  updateUI();
}

function addEmergencyVehicle(type) {
  const v = makeVehicle(type);
  pq.enqueue(v);
  totalSpawned++;
  emergencyCount++;
  log(`[PRIORITY] ${v.emoji} ${v.label} #${v.id} → Priority Queue (P:${v.priority})`, 'emergency');
  updateUI();
}

function processNextVehicle() {
  let v = null;
  if (!pq.isEmpty()) {
    v = pq.dequeue();
    log(`[DISPATCH] 🚨 ${v.emoji} ${v.label} #${v.id} PRIORITY CLEARED → entering road`, 'emergency');
  } else if (!nq.isEmpty()) {
    if (lightState === 'red') return; // normal vehicles wait at red
    v = nq.dequeue();
    log(`[DISPATCH] ${v.emoji} ${v.label} #${v.id} entering road`, 'normal');
  }

  if (v) {
    const occupiedLanes = activeVehicles.filter(a => a.x < canvas.width * 0.3).map(a => a.lane);
    let lane = LANES[Math.floor(Math.random() * LANES.length)];
    for (let l of LANES) {
      if (!occupiedLanes.includes(l)) { lane = l; break; }
    }
    v.x = -v.width;
    v.lane = lane;
    v.y = canvas.height * lane;
    v.active = true;
    v.flash = v.priority > 0 ? 30 : 0;
    activeVehicles.push(v);
    updateUI();
  }
}

function clearAll() {
  pq = new PriorityQueue();
  nq = new Queue();
  activeVehicles = [];
  clearedCount = 0;
  emergencyCount = 0;
  totalSpawned = 0;
  idCounter = 0;
  log('[SYSTEM] All queues cleared.', 'clear');
  updateUI();
}

function togglePause() {
  paused = !paused;
  document.getElementById('pauseBtn').textContent = paused ? '▶ RESUME' : '⏸ PAUSE';
  log(`[SYSTEM] Simulation ${paused ? 'PAUSED' : 'RESUMED'}`, 'system');
}

function updateSpeed(v) {
  simSpeed = parseFloat(v);
  document.getElementById('speedVal').textContent = v + 'x';
}

let autoSpawnInterval = null;
function autoSpawn() {
  autoSpawnOn = !autoSpawnOn;
  if (autoSpawnOn) {
    log('[SYSTEM] Auto-spawn ENABLED', 'system');
    autoSpawnInterval = setInterval(() => {
      if (paused) return;
      const r = Math.random();
      if (r < 0.15) addEmergencyVehicle(['ambulance','fire','police'][Math.floor(Math.random()*3)]);
      else if (r < 0.45) addNormalVehicle('truck');
      else addNormalVehicle('car');
    }, 1800 / simSpeed);
  } else {
    clearInterval(autoSpawnInterval);
    log('[SYSTEM] Auto-spawn DISABLED', 'system');
  }
}

// ============================
// TRAFFIC LIGHT
// ============================

function updateLight(delta) {
  lightTimer += delta;
  const dur = lightDurations[lightState];

  // Emergency override: if there's a priority vehicle, force green
  if (!pq.isEmpty() && lightState === 'red') {
    lightState = 'green';
    lightTimer = 0;
    log('[SYSTEM] 🚨 Traffic light OVERRIDDEN → GREEN for emergency!', 'emergency');
  }

  if (lightTimer >= dur) {
    lightTimer = 0;
    if (lightState === 'green') lightState = 'yellow';
    else if (lightState === 'yellow') lightState = 'red';
    else lightState = 'green';
  }

  const rd = document.getElementById('tl-red');
  const yd = document.getElementById('tl-yellow');
  const gd = document.getElementById('tl-green');
  const lb = document.getElementById('tl-label');
  rd.className = 'tl-dot' + (lightState === 'red' ? ' active-red' : ' off');
  yd.className = 'tl-dot' + (lightState === 'yellow' ? ' active-yellow' : ' off');
  gd.className = 'tl-dot' + (lightState === 'green' ? ' active-green' : ' off');
  lb.textContent = lightState.toUpperCase();
}

// ============================
// RENDER
// ============================

function drawRoad() {
  const W = canvas.width, H = canvas.height;
  const roadTop = H * 0.18;
  const roadBot = H * 0.82;

  // Road surface
  ctx.fillStyle = '#0e0e1e';
  ctx.fillRect(0, roadTop, W, roadBot - roadTop);

  // Lane dividers
  ctx.setLineDash([30, 20]);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 2;
  for (const lane of LANES) {
    if (lane === 0.5) continue;
    ctx.beginPath();
    ctx.moveTo(0, H * lane);
    ctx.lineTo(W, H * lane);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Road borders
  ctx.strokeStyle = 'rgba(0,212,255,0.15)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, roadTop); ctx.lineTo(W, roadTop);
  ctx.moveTo(0, roadBot); ctx.lineTo(W, roadBot);
  ctx.stroke();

  // Intersection zone
  const ix = W * 0.5;
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = lightState === 'green' ? '#00ff88' : lightState === 'yellow' ? '#ffaa00' : '#ff3c3c';
  ctx.fillRect(ix - 40, roadTop, 80, roadBot - roadTop);
  ctx.restore();

  // Stopline
  const stopX = W * 0.5 - 50;
  ctx.strokeStyle = lightState === 'red' ? 'rgba(255,60,60,0.8)' : 'rgba(255,255,255,0.15)';
  ctx.lineWidth = lightState === 'red' ? 3 : 1;
  ctx.beginPath();
  ctx.moveTo(stopX, roadTop); ctx.lineTo(stopX, roadBot);
  ctx.stroke();

  // Traffic signal
  drawTrafficSignal(W * 0.5 - 40, roadTop - 50);

  // Grid/bg pattern
  ctx.save();
  ctx.globalAlpha = 0.025;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  for (let gx = 0; gx < W; gx += 60) {
    ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
  }
  ctx.restore();
}

function drawTrafficSignal(x, y) {
  ctx.fillStyle = '#0a0a1a';
  ctx.strokeStyle = 'rgba(0,212,255,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x - 18, y, 36, 52, 4);
  ctx.fill(); ctx.stroke();

  const colors = [
    lightState === 'red' ? '#ff3c3c' : '#330000',
    lightState === 'yellow' ? '#ffaa00' : '#332200',
    lightState === 'green' ? '#00ff88' : '#003322',
  ];
  const glow = [
    lightState === 'red' ? 'rgba(255,60,60,0.8)' : null,
    lightState === 'yellow' ? 'rgba(255,170,0,0.8)' : null,
    lightState === 'green' ? 'rgba(0,255,136,0.8)' : null,
  ];
  for (let i = 0; i < 3; i++) {
    if (glow[i]) {
      ctx.shadowColor = glow[i];
      ctx.shadowBlur = 15;
    }
    ctx.fillStyle = colors[i];
    ctx.beginPath();
    ctx.arc(x, y + 10 + i * 16, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function drawVehicle(v) {
  const H = canvas.height;
  const cy = v.y;
  const cx = v.x;
  const isEmergency = v.priority > 0;

  ctx.save();

  // Emergency flash effect
  if (v.flash > 0) {
    ctx.shadowColor = v.color;
    ctx.shadowBlur = 20 + Math.sin(v.flash * 0.5) * 10;
    v.flash--;
  }

  // Glow for emergency
  if (isEmergency) {
    ctx.shadowColor = v.color;
    ctx.shadowBlur = 12 + Math.sin(Date.now() * 0.005) * 6;
  }

  // Vehicle body
  ctx.fillStyle = isEmergency ? 'rgba(255,60,60,0.1)' : 'rgba(0,255,136,0.08)';
  ctx.strokeStyle = v.color;
  ctx.lineWidth = isEmergency ? 2 : 1.5;
  ctx.beginPath();
  ctx.roundRect(cx - v.width / 2, cy - v.height / 2, v.width, v.height, 4);
  ctx.fill(); ctx.stroke();

  ctx.shadowBlur = 0;

  // Emoji
  ctx.font = `${Math.min(v.width * 0.6, 22)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(v.emoji, cx, cy);

  // ID label
  ctx.font = '8px Share Tech Mono';
  ctx.fillStyle = v.color;
  ctx.textAlign = 'center';
  ctx.fillText(`#${v.id}`, cx, cy + v.height / 2 + 8);

  // Emergency siren lights
  if (isEmergency) {
    const blink = Math.floor(Date.now() / 200) % 2;
    ctx.fillStyle = blink ? '#ff0000' : '#0055ff';
    ctx.beginPath();
    ctx.arc(cx - 6, cy - v.height / 2 - 4, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = blink ? '#0055ff' : '#ff0000';
    ctx.beginPath();
    ctx.arc(cx + 6, cy - v.height / 2 - 4, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// ============================
// MAIN LOOP
// ============================

let lastTime = 0;
let frame = 0;

function loop(ts) {
  const dt = Math.min((ts - lastTime) / 16.67, 3) * simSpeed;
  lastTime = ts;
  frame++;

  if (!paused) {
    // Light update
    updateLight(dt);

    // Process queue
    processingTimer += dt;
    if (processingTimer >= processInterval / simSpeed) {
      processingTimer = 0;
      processNextVehicle();
    }

    // Move vehicles
    const stopX = canvas.width * 0.5 - 50;
    for (const v of activeVehicles) {
      const isEmergency = v.priority > 0;
      const wouldPassStop = v.x + v.speed * dt >= stopX - v.width / 2;
      const shouldStop = lightState === 'red' && !isEmergency && v.x + v.width / 2 < stopX;

      if (shouldStop && wouldPassStop) {
        v.x = stopX - v.width / 2 - 2;
      } else {
        v.x += v.speed * dt;
      }

      if (v.x > canvas.width + 80) {
        v.cleared = true;
        clearedCount++;
        log(`[CLEARED] ${v.emoji} ${v.label} #${v.id} passed through`, v.priority > 0 ? 'emergency' : 'normal');
      }
    }
    activeVehicles = activeVehicles.filter(v => !v.cleared);
    updateStats();
  }

  // Draw
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawRoad();
  for (const v of activeVehicles) drawVehicle(v);

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

// ============================
// UI UPDATES
// ============================

function updateUI() {
  updateStats();
  updateQueueDisplay();
}

function updateStats() {
  document.getElementById('stat-total').textContent = totalSpawned;
  document.getElementById('stat-cleared').textContent = clearedCount;
  document.getElementById('stat-emergency').textContent = emergencyCount;
  document.getElementById('stat-waiting').textContent = pq.size() + nq.size();
}

function updateQueueDisplay() {
  // Priority queue
  const pqDiv = document.getElementById('priorityQueue');
  pqDiv.innerHTML = '';
  if (pq.isEmpty()) {
    pqDiv.innerHTML = '<div style="color:#2a4a6a;font-size:11px;text-align:center;padding:10px;">— EMPTY —</div>';
  } else {
    const sorted = [...pq.heap].sort((a, b) => b.priority - a.priority);
    sorted.forEach((v, i) => {
      const el = document.createElement('div');
      el.className = 'queue-item emergency';
      el.innerHTML = `<span>${v.emoji}</span><span>${v.label} #${v.id}</span><span class="priority-badge">P:${v.priority}</span>`;
      pqDiv.appendChild(el);
    });
  }

  // Normal queue
  const nqDiv = document.getElementById('normalQueue');
  nqDiv.innerHTML = '';
  if (nq.isEmpty()) {
    nqDiv.innerHTML = '<div style="color:#2a4a6a;font-size:11px;text-align:center;padding:10px;">— EMPTY —</div>';
  } else {
    nq.items.forEach((v, i) => {
      const el = document.createElement('div');
      el.className = 'queue-item normal';
      el.innerHTML = `<span>${v.emoji}</span><span>${v.label} #${v.id}</span><span style="margin-left:auto;color:#2a5a3a;font-size:9px;">pos:${i + 1}</span>`;
      nqDiv.appendChild(el);
    });
  }
}

let logLines = [];
function log(msg, type = 'system') {
  const now = new Date();
  const t = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  logLines.push({ t, msg, type });
  if (logLines.length > 80) logLines.shift();

  const box = document.getElementById('logBox');
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `<span class="log-time">${t}</span><span class="log-msg ${type}">${msg}</span>`;
  box.appendChild(entry);
  box.scrollTop = box.scrollHeight;
}

// Init
log('[SYSTEM] Traffic Priority Simulator initialized', 'system');
log('[SYSTEM] Priority Queue (Max-Heap) + FIFO Queue active', 'system');
log('[SYSTEM] Emergency vehicles bypass red lights!', 'emergency');
updateUI();
