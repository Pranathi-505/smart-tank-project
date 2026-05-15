/* ============================================================
   SMART TANK MONITORING SYSTEM — SCRIPT.JS
   ============================================================ */

// ── CONFIG ──────────────────────────────────────────────────
const CONFIG = {
  MAX_LEVEL:       90,
  MIN_LEVEL:       20,
  PH_MIN:          6.5,
  PH_MAX:          8.5,
  TURBIDITY_MAX:   5,
  TEMP_MAX:        40,
  MONITOR_DELAY:   3000,   // ms
  MAX_LOG_ENTRIES: 80,
  MAX_CHART_POINTS: 40,
};

// ── STATE ────────────────────────────────────────────────────
let monitorInterval = null;
let isMonitoring    = false;
let motorStatus     = "OFF";
let dataLog         = [];       // in-memory records
let chartPoints     = [];       // last N level readings

// ── DOM HELPERS ──────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

// ── CLOCK ────────────────────────────────────────────────────
function startClock() {
  const updateClock = () => {
    const now = new Date();
    $("sidebarTime").textContent = now.toLocaleTimeString();
  };
  updateClock();
  setInterval(updateClock, 1000);
}

// ── NAVIGATION ───────────────────────────────────────────────
document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const page = btn.dataset.page;
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    $(`page-${page}`).classList.add("active");
    if (page === "statistics") updateStatisticsPage();
  });
});

// ── SENSOR DATA GENERATION ───────────────────────────────────
function rand(min, max, decimals = 2) {
  const val = Math.random() * (max - min) + min;
  return parseFloat(val.toFixed(decimals));
}
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function generateSensorData() {
  return {
    water_level: randInt(0, 100),
    ph:          rand(5.5, 9.5),
    turbidity:   rand(1, 10),
    temperature: rand(20, 45),
    flow_rate:   rand(10, 50),
    pressure:    rand(1, 5),
    battery:     randInt(40, 100),
    timestamp:   new Date(),
  };
}

// ── SENSOR HEALTH ────────────────────────────────────────────
function getSensorHealth() {
  const roll = () => Math.random() < 0.85 ? "OK" : "ERROR";
  return {
    "h-ultra": roll(),
    "h-ph":    roll(),
    "h-turb":  roll(),
    "h-temp":  roll(),
  };
}

// ── ANALYSIS ─────────────────────────────────────────────────
function analyzeData(data) {
  const alerts = [];

  if (data.water_level > CONFIG.MAX_LEVEL) {
    alerts.push("⚠ OVERFLOW ALERT");
    motorStatus = "OFF";
  } else if (data.water_level < CONFIG.MIN_LEVEL) {
    alerts.push("⚠ LOW WATER LEVEL ALERT");
    motorStatus = "ON";
  } else {
    motorStatus = "OFF";
  }

  if (data.ph < CONFIG.PH_MIN)       alerts.push("⚠ WATER TOO ACIDIC");
  if (data.ph > CONFIG.PH_MAX)       alerts.push("⚠ WATER TOO ALKALINE");
  if (data.turbidity > CONFIG.TURBIDITY_MAX) alerts.push("⚠ DIRTY WATER DETECTED");
  if (data.temperature > CONFIG.TEMP_MAX)    alerts.push("⚠ HIGH WATER TEMPERATURE");
  if (data.battery < 50)             alerts.push("⚠ LOW SYSTEM BATTERY");

  return alerts;
}

// ── DASHBOARD UPDATE ─────────────────────────────────────────
function updateDashboard(data, alerts) {
  // ─ Tank level
  const level = data.water_level;
  $("tankWater").style.height = level + "%";
  $("levelNum").textContent   = level;

  // Color the number based on thresholds
  const levelNum = $("levelNum");
  if (level > CONFIG.MAX_LEVEL || level < CONFIG.MIN_LEVEL) {
    levelNum.style.color = "var(--red)";
    levelNum.style.textShadow = "0 0 30px rgba(255,51,85,0.6)";
  } else {
    levelNum.style.color = "var(--accent)";
    levelNum.style.textShadow = "0 0 30px rgba(0,212,255,0.5)";
  }

  // Motor badge
  const badge = $("motorBadge");
  badge.textContent = motorStatus === "ON" ? "MOTOR ON" : "MOTOR OFF";
  badge.classList.toggle("on", motorStatus === "ON");

  // ─ pH
  updateSensorCard("ph", data.ph, {
    min: 0, max: 14,
    warnLow:  CONFIG.PH_MIN,
    warnHigh: CONFIG.PH_MAX,
    decimals: 2,
  });

  // ─ Turbidity
  updateSensorCard("turbidity", data.turbidity, {
    min: 0, max: 10,
    warnHigh: CONFIG.TURBIDITY_MAX,
    decimals: 1,
  });

  // ─ Temperature
  updateSensorCard("temp", data.temperature, {
    min: 0, max: 50,
    warnHigh: CONFIG.TEMP_MAX,
    decimals: 1,
  });

  // ─ Flow rate
  updateSensorCard("flow", data.flow_rate, {
    min: 0, max: 50,
    decimals: 1,
    noAlert: true,
  });

  // ─ Pressure
  updateSensorCard("pressure", data.pressure, {
    min: 0, max: 5,
    decimals: 2,
    noAlert: true,
  });

  // ─ Battery
  updateSensorCard("battery", data.battery, {
    min: 0, max: 100,
    warnLow: 50,
    decimals: 0,
  });

  // ─ Alert banner
  const banner = $("alertBanner");
  if (alerts.length) {
    banner.style.display = "block";
    banner.innerHTML = alerts.join("&nbsp;&nbsp;|&nbsp;&nbsp;");
  } else {
    banner.style.display = "none";
  }

  // ─ Sensor health
  const health = getSensorHealth();
  for (const [id, status] of Object.entries(health)) {
    const chip = $(id);
    chip.textContent = status;
    chip.classList.toggle("error", status === "ERROR");
  }

  // ─ Event log
  appendLog(data, alerts);
}

function updateSensorCard(key, value, opts) {
  const { min, max, warnLow, warnHigh, decimals, noAlert } = opts;
  const valEl    = $(`val-${key}`);
  const barEl    = $(`bar-${key}`);
  const statusEl = $(`status-${key}`);
  const cardEl   = $(`card-${key}`);

  valEl.textContent = value.toFixed(decimals ?? 2);

  // Fill bar
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  barEl.style.width = pct + "%";

  if (noAlert) {
    barEl.style.background = "var(--accent)";
    statusEl.textContent = "Normal";
    statusEl.className = "sensor-status";
    cardEl.classList.remove("warn", "danger");
    return;
  }

  let state = "ok";
  if ((warnLow !== undefined && value < warnLow) ||
      (warnHigh !== undefined && value > warnHigh)) {
    state = "warn";
  }
  // deeper red thresholds
  if ((warnLow !== undefined && value < warnLow * 0.85) ||
      (warnHigh !== undefined && value > warnHigh * 1.15)) {
    state = "danger";
  }

  const colorMap = { ok: "var(--green)", warn: "var(--yellow)", danger: "var(--red)" };
  barEl.style.background = colorMap[state];
  statusEl.textContent   = state === "ok" ? "Normal" : state === "warn" ? "Warning" : "Alert!";
  statusEl.className     = `sensor-status ${state === "ok" ? "" : state}`;
  cardEl.classList.toggle("warn",   state === "warn");
  cardEl.classList.toggle("danger", state === "danger");
}

// ── EVENT LOG ─────────────────────────────────────────────────
function appendLog(data, alerts) {
  const scroll = $("logScroll");
  const time   = data.timestamp.toLocaleTimeString();
  const entry  = document.createElement("div");
  entry.className = "log-entry " + (alerts.length ? (alerts.some(a => a.includes("OVERFLOW") || a.includes("ACIDIC")) ? "danger" : "warn") : "ok");
  entry.textContent = `[${time}]  Level: ${data.water_level}%  pH: ${data.ph}  Temp: ${data.temperature}°C  ${alerts.length ? alerts[0] : "All Normal"}`;
  scroll.appendChild(entry);

  // Trim oldest
  const entries = scroll.querySelectorAll(".log-entry");
  if (entries.length > CONFIG.MAX_LOG_ENTRIES) entries[0].remove();
}

$("clearLogBtn").addEventListener("click", () => {
  $("logScroll").innerHTML = "";
});

// ── MONITORING CONTROL ────────────────────────────────────────
const monitorBtn = $("monitorBtn");
const statusDot  = $("statusDot");
const statusLbl  = $("statusLabel");

monitorBtn.addEventListener("click", () => {
  if (isMonitoring) stopMonitoring();
  else              startMonitoring();
});

function startMonitoring() {
  isMonitoring = true;
  monitorBtn.textContent = "⏹ STOP MONITORING";
  monitorBtn.classList.add("running");
  statusDot.classList.add("active");
  statusDot.classList.remove("idle");
  statusLbl.textContent = "Live";

  runCycle(); // immediate first reading
  monitorInterval = setInterval(runCycle, CONFIG.MONITOR_DELAY);
}

function stopMonitoring() {
  isMonitoring = false;
  clearInterval(monitorInterval);
  monitorBtn.textContent = "▶ START MONITORING";
  monitorBtn.classList.remove("running");
  statusDot.classList.remove("active");
  statusDot.classList.add("idle");
  statusLbl.textContent = "Idle";
}

function runCycle() {
  const data   = generateSensorData();
  const alerts = analyzeData(data);
  updateDashboard(data, alerts);
  dataLog.push({ data, alerts });

  // Chart point
  chartPoints.push({ t: data.timestamp, v: data.water_level });
  if (chartPoints.length > CONFIG.MAX_CHART_POINTS) chartPoints.shift();
}

// ── STATISTICS PAGE ───────────────────────────────────────────
function updateStatisticsPage() {
  const records = dataLog;
  $("recordCount").textContent = records.length;

  if (!records.length) {
    $("stat-avgLevel").textContent = "--";
    $("stat-maxLevel").textContent = "--";
    $("stat-minLevel").textContent = "--";
    $("stat-avgTemp").textContent  = "--";
    $("stat-avgPh").textContent    = "--";
    $("stat-alerts").textContent   = "--";
    $("chartEmpty").style.display  = "block";
    $("tableEmpty").style.display  = "block";
    $("tableBody").innerHTML       = "";
    return;
  }

  const levels = records.map(r => r.data.water_level);
  const temps  = records.map(r => r.data.temperature);
  const phs    = records.map(r => r.data.ph);
  const totalAlerts = records.reduce((acc, r) => acc + r.alerts.length, 0);

  const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;

  $("stat-avgLevel").textContent = avg(levels).toFixed(1);
  $("stat-maxLevel").textContent = Math.max(...levels);
  $("stat-minLevel").textContent = Math.min(...levels);
  $("stat-avgTemp").textContent  = avg(temps).toFixed(1);
  $("stat-avgPh").textContent    = avg(phs).toFixed(2);
  $("stat-alerts").textContent   = totalAlerts;

  drawChart();
  renderTable(records.slice(-20).reverse());

  $("chartEmpty").style.display = "none";
  $("tableEmpty").style.display = "none";
}

// ── CANVAS CHART ──────────────────────────────────────────────
function drawChart() {
  const canvas = $("levelChart");
  if (!canvas) return;
  const ctx    = canvas.getContext("2d");
  const W      = canvas.parentElement.clientWidth - 40;
  const H      = 180;
  canvas.width  = W;
  canvas.height = H;

  if (!chartPoints.length) return;

  const pad   = { top: 14, bottom: 24, left: 36, right: 14 };
  const cW    = W - pad.left - pad.right;
  const cH    = H - pad.top - pad.bottom;
  const pts   = chartPoints;
  const xStep = cW / Math.max(pts.length - 1, 1);

  // Background grid
  ctx.strokeStyle = "rgba(26,58,80,0.5)";
  ctx.lineWidth   = 1;
  for (let y = 0; y <= 4; y++) {
    const yy = pad.top + (cH / 4) * y;
    ctx.beginPath(); ctx.moveTo(pad.left, yy); ctx.lineTo(pad.left + cW, yy); ctx.stroke();
  }

  // Danger zones
  const yOf = (v) => pad.top + cH - (v / 100) * cH;
  ctx.fillStyle = "rgba(255,51,85,0.06)";
  ctx.fillRect(pad.left, pad.top, cW, yOf(CONFIG.MAX_LEVEL) - pad.top);
  ctx.fillStyle = "rgba(255,51,85,0.06)";
  ctx.fillRect(pad.left, yOf(CONFIG.MIN_LEVEL), cW, pad.top + cH - yOf(CONFIG.MIN_LEVEL));

  // Threshold lines
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "rgba(255,51,85,0.4)";
  ctx.lineWidth   = 1;
  ctx.beginPath(); ctx.moveTo(pad.left, yOf(CONFIG.MAX_LEVEL)); ctx.lineTo(pad.left + cW, yOf(CONFIG.MAX_LEVEL)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(pad.left, yOf(CONFIG.MIN_LEVEL)); ctx.lineTo(pad.left + cW, yOf(CONFIG.MIN_LEVEL)); ctx.stroke();
  ctx.setLineDash([]);

  // Fill gradient
  const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
  grad.addColorStop(0, "rgba(0,212,255,0.25)");
  grad.addColorStop(1, "rgba(0,212,255,0.01)");

  ctx.beginPath();
  ctx.moveTo(pad.left + 0 * xStep, yOf(pts[0].v));
  pts.forEach((p, i) => ctx.lineTo(pad.left + i * xStep, yOf(p.v)));
  ctx.lineTo(pad.left + (pts.length - 1) * xStep, pad.top + cH);
  ctx.lineTo(pad.left, pad.top + cH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.strokeStyle = "#00d4ff";
  ctx.lineWidth   = 2;
  ctx.lineJoin    = "round";
  pts.forEach((p, i) => {
    const x = pad.left + i * xStep;
    const y = yOf(p.v);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Dots
  pts.forEach((p, i) => {
    const x   = pad.left + i * xStep;
    const y   = yOf(p.v);
    const col = p.v > CONFIG.MAX_LEVEL || p.v < CONFIG.MIN_LEVEL ? "#ff3355" : "#00d4ff";
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle   = col;
    ctx.shadowColor = col;
    ctx.shadowBlur  = 6;
    ctx.fill();
    ctx.shadowBlur  = 0;
  });

  // Y labels
  ctx.fillStyle  = "rgba(90,138,160,0.8)";
  ctx.font       = "9px 'Share Tech Mono'";
  ctx.textAlign  = "right";
  [0, 25, 50, 75, 100].forEach(v => {
    ctx.fillText(v + "%", pad.left - 4, yOf(v) + 3);
  });
}

// ── TABLE ─────────────────────────────────────────────────────
function renderTable(records) {
  const tbody = $("tableBody");
  tbody.innerHTML = "";

  records.forEach(({ data, alerts }) => {
    const tr  = document.createElement("tr");
    const status = alerts.length === 0 ? "ok" :
                   alerts.some(a => a.includes("OVERFLOW") || a.includes("ACIDIC")) ? "danger" : "warn";
    const statusText = alerts.length ? alerts[0].replace("⚠ ", "") : "Normal";
    tr.innerHTML = `
      <td>${data.timestamp.toLocaleTimeString()}</td>
      <td>${data.water_level}%</td>
      <td>${data.ph}</td>
      <td>${data.turbidity}</td>
      <td>${data.temperature}</td>
      <td>${data.flow_rate}</td>
      <td>${data.battery}%</td>
      <td class="tag-${status}">${statusText}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ── CSV EXPORT ────────────────────────────────────────────────
$("exportBtn").addEventListener("click", () => {
  if (!dataLog.length) { alert("No data to export yet!"); return; }

  const headers = ["Timestamp","Water Level","pH","Turbidity","Temperature","Flow Rate","Pressure","Battery","Alerts"];
  const rows    = dataLog.map(({ data, alerts }) => [
    data.timestamp.toISOString(),
    data.water_level,
    data.ph,
    data.turbidity,
    data.temperature,
    data.flow_rate,
    data.pressure,
    data.battery,
    alerts.map(a => a.replace("⚠ ", "")).join("; ") || "Normal"
  ]);

  const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `smart_tank_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// ── INIT ──────────────────────────────────────────────────────
startClock();
