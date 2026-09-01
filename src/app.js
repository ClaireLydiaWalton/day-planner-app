const DAY_START = 6 * 60;
const DAY_END = 30 * 60;
const DAY_MINUTES = DAY_END - DAY_START;
const SNAP = 15;
const STORAGE_KEY = "daylight-os-planner-v4";
const DATA_VERSION = 8;
const THEMES = ["hacker", "earth", "ocean", "dream", "velvet"];
const MEDITATION_NAMES = [
  "PENDULUM SAND",
  "FRACTAL FERN",
  "ORBITAL BLOOM",
  "TIDAL MANDALA",
  "STRANGE ATTRACTOR",
  "GOLDEN GARDEN"
];

const DEFAULT_PALETTE = [
  { id: "wake-coffee", name: "Rise", duration: 45, signal: 0 },
  { id: "settle", name: "Settle", duration: 45, signal: 0 },
  { id: "breakfast", name: "Food", duration: 45, signal: 4 },
  { id: "movement", name: "Movement", duration: 60, signal: 1 },
  { id: "writing", name: "Research", duration: 120, signal: 3 },
  { id: "campus", name: "Campus", duration: 180, signal: 2 },
  { id: "reading", name: "Commute", duration: 60, signal: 7 },
  { id: "admin", name: "Chores", duration: 45, signal: 5 },
  { id: "free", name: "Bathe", duration: 90, signal: 6 },
  { id: "sleep", name: "Sleep", duration: 60, signal: 3, kind: "sleep" }
];

const dayNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

let weekStart = startOfWeek(new Date());
let activeDate = dateKey(new Date());
let dragPayload = null;
let palette = DEFAULT_PALETTE.map((item) => ({ ...item }));
let customPalette = [];
let schedule = createDemoSchedule();
let oceanLoad = 0;
let currentTheme = "hacker";
let themeSignalMemory = { hacker: 0, earth: 0, ocean: 0, dream: 0, velvet: 0 };
let layoutLocked = false;
let editingTemplateId = null;
let activityEditMode = false;
let dayClipboard = null;
let dayMenuDate = null;
let historyPast = [];
let historyFuture = [];
let chapterState = { date: "", index: 0 };
let reflectionMode = "visual";
let meditationState = { pattern: 0, seed: Math.floor(Math.random() * 1_000_000_000) };
let meditationController = null;
const HISTORY_LIMIT = 50;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function startOfWeek(date) {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

function addDays(date, count) {
  const result = new Date(date);
  result.setDate(result.getDate() + count);
  return result;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function weekDates() {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function blockFrom(template, start) {
  return {
    instanceId: uid(),
    templateId: template.id,
    name: template.name,
    duration: template.duration,
    signal: Number(template.signal) || 0,
    start
  };
}

function createDemoSchedule() {
  const dates = Array.from({ length: 7 }, (_, index) => dateKey(addDays(startOfWeek(new Date()), index)));
  const demo = Object.fromEntries(dates.map((key) => [key, []]));
  const templates = Object.fromEntries(palette.map((item) => [item.id, item]));
  const add = (day, template, start, duration = template.duration) => {
    const block = blockFrom(template, start);
    block.duration = duration;
    demo[dates[day]].push(block);
  };

  add(0, templates["wake-coffee"], 7 * 60); add(0, templates.movement, 8 * 60); add(0, templates.writing, 9 * 60 + 30); add(0, templates.reading, 13 * 60); add(0, templates.free, 15 * 60 + 30);
  add(1, templates["wake-coffee"], 6 * 60 + 45); add(1, templates.writing, 8 * 60 + 30); add(1, templates.admin, 11 * 60); add(1, templates.campus, 13 * 60); add(1, templates.reading, 19 * 60);
  add(2, templates["wake-coffee"], 7 * 60 + 15); add(2, templates.campus, 9 * 60); add(2, templates.reading, 20 * 60);
  add(3, templates["wake-coffee"], 7 * 60); add(3, templates.movement, 8 * 60); add(3, templates.writing, 10 * 60); add(3, templates.free, 14 * 60); add(3, templates.reading, 19 * 60 + 30);
  add(4, templates.breakfast, 7 * 60 + 30); add(4, templates.admin, 9 * 60); add(4, templates.writing, 10 * 60 + 30); add(4, templates.campus, 14 * 60);
  add(5, templates["wake-coffee"], 7 * 60 + 30); add(5, templates.writing, 9 * 60); add(5, templates.free, 15 * 60);
  add(6, templates.breakfast, 8 * 60 + 30); add(6, templates.movement, 10 * 60); add(6, templates.reading, 14 * 60); add(6, templates.free, 17 * 60);
  return demo;
}

function snapshotState() {
  return {
    dataVersion: DATA_VERSION,
    schedule,
    palette,
    customPalette,
    weekStart: dateKey(weekStart),
    activeDate,
    currentTheme,
    themeSignalMemory,
    layoutLocked,
    chapterState,
    reflectionMode,
    meditationState
  };
}

function migrateDefaultActivities() {
  const renamed = { "wake-coffee": "Rise", breakfast: "Food", writing: "Research", reading: "Commute", admin: "Chores", free: "Bathe" };
  palette = palette
    .filter((item) => item.id !== "errands")
    .map((item) => renamed[item.id] ? { ...item, name: renamed[item.id] } : item);
  if (!palette.some((item) => item.id === "sleep")) {
    palette.push({ ...DEFAULT_PALETTE.find((item) => item.id === "sleep") });
  }
  if (!palette.some((item) => item.id === "settle")) {
    const riseIndex = palette.findIndex((item) => item.id === "wake-coffee");
    palette.splice(riseIndex >= 0 ? riseIndex + 1 : 0, 0, { ...DEFAULT_PALETTE.find((item) => item.id === "settle") });
  }
  Object.keys(schedule).forEach((key) => {
    const blocks = Array.isArray(schedule[key]) ? schedule[key] : [];
    schedule[key] = blocks
      .filter((block) => block.templateId !== "errands")
      .map((block) => {
        const migrated = renamed[block.templateId] ? { ...block, name: renamed[block.templateId] } : { ...block };
        if (migrated.templateId === "sleep" && migrated.sleepSegment === "night" && migrated.start >= 23 * 60) {
          migrated.duration = DAY_END - migrated.start;
        }
        return migrated;
      });
  });
}

function cloneState(state = snapshotState()) {
  return JSON.parse(JSON.stringify(state));
}

function save() {
  const state = snapshotState();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Browser fallback storage was unavailable", error);
  }
  window.weekRhythmDesktop?.save(state).catch((error) => {
    console.warn("Desktop planner storage was unavailable", error);
  });
}

function restoreState(state, { persist = true } = {}) {
  if (!state || typeof state !== "object") throw new Error("Invalid planner backup");
  schedule = state.schedule && typeof state.schedule === "object" ? cloneState(state.schedule) : {};
  palette = Array.isArray(state.palette) ? cloneState(state.palette) : DEFAULT_PALETTE.map((item) => ({ ...item }));
  customPalette = Array.isArray(state.customPalette) ? cloneState(state.customPalette) : [];
  weekStart = state.weekStart ? dateFromKey(state.weekStart) : startOfWeek(new Date());
  activeDate = state.activeDate || dateKey(weekStart);
  currentTheme = THEMES.includes(state.currentTheme) ? state.currentTheme : "hacker";
  themeSignalMemory = { hacker: 0, earth: 0, ocean: 0, dream: 0, velvet: 0, ...(state.themeSignalMemory || {}) };
  layoutLocked = Boolean(state.layoutLocked);
  chapterState = { date: state.chapterState?.date || "", index: Number(state.chapterState?.index) || 0 };
  reflectionMode = state.reflectionMode === "tao" ? "tao" : "visual";
  meditationState = {
    pattern: Math.floor(Math.abs(Number(state.meditationState?.pattern) || 0)) % MEDITATION_NAMES.length,
    seed: Number(state.meditationState?.seed) || Math.floor(Math.random() * 1_000_000_000)
  };
  if (Number(state.dataVersion || 0) < DATA_VERSION) migrateDefaultActivities();
  applyTheme(currentTheme);
  updateLockState();
  renderPalette();
  render();
  if (persist) save();
}

function recordHistory() {
  historyPast.push(cloneState({ schedule, palette, customPalette, themeSignalMemory }));
  if (historyPast.length > HISTORY_LIMIT) historyPast.shift();
  historyFuture = [];
  updateHistoryControls();
}

function currentHistoryState() {
  return cloneState({ schedule, palette, customPalette, themeSignalMemory });
}

function restoreHistoryState(state) {
  schedule = state.schedule || {};
  palette = Array.isArray(state.palette) ? state.palette : DEFAULT_PALETTE.map((item) => ({ ...item }));
  customPalette = Array.isArray(state.customPalette) ? state.customPalette : [];
  themeSignalMemory = { hacker: 0, earth: 0, ocean: 0, dream: 0, velvet: 0, ...(state.themeSignalMemory || {}) };
  save();
  renderPalette();
  render();
}

function undo() {
  const previous = historyPast.pop();
  if (!previous) return;
  historyFuture.push(currentHistoryState());
  restoreHistoryState(previous);
  updateHistoryControls();
  showToast("UNDO");
}

function redo() {
  const next = historyFuture.pop();
  if (!next) return;
  historyPast.push(currentHistoryState());
  restoreHistoryState(next);
  updateHistoryControls();
  showToast("REDO");
}

function updateHistoryControls() {
  if (!$("#undo-action")) return;
  $("#undo-action").disabled = historyPast.length === 0;
  $("#redo-action").disabled = historyFuture.length === 0;
}

async function load() {
  let saved = null;
  let loadedFromDesktop = false;
  if (window.weekRhythmDesktop?.available) {
    try {
      saved = await window.weekRhythmDesktop.load();
      loadedFromDesktop = Boolean(saved);
    } catch (error) {
      console.warn("Desktop planner storage could not be read", error);
    }
  }
  try {
    if (!saved) saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return;
    schedule = saved.schedule || schedule;
    palette = Array.isArray(saved.palette) ? saved.palette : palette;
    customPalette = saved.customPalette || [];
    weekStart = saved.weekStart ? dateFromKey(saved.weekStart) : weekStart;
    activeDate = saved.activeDate || activeDate;
    currentTheme = THEMES.includes(saved.currentTheme) ? saved.currentTheme : "hacker";
    themeSignalMemory = { hacker: 0, earth: 0, ocean: 0, dream: 0, velvet: 0, ...(saved.themeSignalMemory || {}) };
    layoutLocked = Boolean(saved.layoutLocked);
    chapterState = { date: saved.chapterState?.date || "", index: Number(saved.chapterState?.index) || 0 };
    reflectionMode = saved.reflectionMode === "tao" ? "tao" : "visual";
    meditationState = {
      pattern: Math.floor(Math.abs(Number(saved.meditationState?.pattern) || 0)) % MEDITATION_NAMES.length,
      seed: Number(saved.meditationState?.seed) || Math.floor(Math.random() * 1_000_000_000)
    };
    if (Number(saved.dataVersion || 0) < DATA_VERSION) {
      migrateDefaultActivities();
      save();
    } else if (window.weekRhythmDesktop?.available && !loadedFromDesktop) {
      await window.weekRhythmDesktop.save(snapshotState());
    }
  } catch (error) {
    console.warn("Planner state could not be restored", error);
    localStorage.removeItem(STORAGE_KEY);
  }
}

function ensureDay(key) {
  if (!schedule[key]) schedule[key] = [];
}

function allTemplates() {
  return [...palette, ...customPalette];
}

function findTemplate(id) {
  return allTemplates().find((item) => item.id === id);
}

function snap(value) {
  return Math.round(value / SNAP) * SNAP;
}

function clampStart(start, duration) {
  return Math.max(DAY_START, Math.min(DAY_END - duration, snap(start)));
}

function formatClock(totalMinutes, rail = false) {
  const normalized = totalMinutes % (24 * 60);
  const hours24 = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  if (rail) {
    const suffix = hours24 === 12 ? "p" : "";
    return `${hours24 % 12 || 12}${suffix}`;
  }
  const suffix = hours24 >= 12 ? "PM" : "AM";
  return `${hours24 % 12 || 12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function formatRailTime(totalMinutes) {
  const normalized = totalMinutes % (24 * 60);
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function formatDuration(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function sortDay(key) {
  ensureDay(key);
  schedule[key].sort((a, b) => a.start - b.start || a.duration - b.duration);
}

function isSlotFree(key, start, duration, ignoreId = null) {
  ensureDay(key);
  const end = start + duration;
  return schedule[key].every((block) => block.instanceId === ignoreId || end <= block.start || start >= block.start + block.duration);
}

function nearestAvailableStart(key, desired, duration, ignoreId = null) {
  const first = clampStart(desired, duration);
  if (isSlotFree(key, first, duration, ignoreId)) return first;
  for (let offset = SNAP; offset <= DAY_MINUTES; offset += SNAP) {
    const after = clampStart(first + offset, duration);
    if (after !== first && isSlotFree(key, after, duration, ignoreId)) return after;
    const before = clampStart(first - offset, duration);
    if (before !== first && isSlotFree(key, before, duration, ignoreId)) return before;
  }
  return first;
}

function buildPushPlan(key, item, desiredStart, direction = 1, ignoreId = null) {
  ensureDay(key);
  const base = schedule[key]
    .filter((block) => block.instanceId !== ignoreId)
    .map((block) => ({ ...block }));
  let candidate = clampStart(desiredStart, item.duration);

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const blocks = base.map((block) => ({ ...block }));
    const movedIds = new Set();
    let boundary;

    if (direction >= 0) {
      let chainStart = candidate;
      let chainEnd = candidate + item.duration;
      for (const block of [...blocks].sort((a, b) => a.start - b.start)) {
        const blockEnd = block.start + block.duration;
        if (blockEnd <= chainStart) continue;
        if (block.start < chainEnd) {
          block.start = chainEnd;
          chainEnd = block.start + block.duration;
          movedIds.add(block.instanceId);
        } else if (movedIds.size) {
          break;
        }
      }
      boundary = chainEnd - DAY_END;
      if (boundary > 0 && candidate > DAY_START) {
        candidate = Math.max(DAY_START, snap(candidate - boundary));
        continue;
      }
    } else {
      let chainStart = candidate;
      let chainEnd = candidate + item.duration;
      for (const block of [...blocks].sort((a, b) => b.start - a.start)) {
        const blockEnd = block.start + block.duration;
        if (block.start >= chainEnd) continue;
        if (blockEnd > chainStart) {
          block.start = chainStart - block.duration;
          chainStart = block.start;
          movedIds.add(block.instanceId);
        } else if (movedIds.size) {
          break;
        }
      }
      boundary = DAY_START - chainStart;
      if (boundary > 0 && candidate < DAY_END - item.duration) {
        candidate = Math.min(DAY_END - item.duration, snap(candidate + boundary));
        continue;
      }
    }

    const valid = blocks.every((block) => block.start >= DAY_START && block.start + block.duration <= DAY_END);
    if (valid) return { movingStart: candidate, blocks, movedIds };
  }
  return null;
}

function clearBlockPreviews() {
  $$(".vertical-ghost").forEach((element) => element.remove());
  $$(".vertical-resize-target").forEach((element) => element.classList.remove("vertical-resize-target"));
  $$(".schedule-block").forEach((element) => {
    element.style.removeProperty("--preview-left");
    element.classList.remove("pushing", "vertical-remove-preview");
  });
}

function applyPlanPreview(key, plan, movingId = null) {
  const track = document.querySelector(`[data-track-date="${key}"]`);
  if (!track || !plan) return null;
  track.querySelectorAll(".schedule-block").forEach((element) => {
    const id = element.dataset.instanceId;
    const planned = id === movingId
      ? { start: plan.movingStart }
      : plan.blocks.find((block) => block.instanceId === id);
    if (!planned) return;
    element.style.setProperty("--preview-left", `${(planned.start - DAY_START) / DAY_MINUTES * 100}%`);
    element.classList.toggle("pushing", plan.movedIds.has(id));
  });
  return track;
}

function previewPush(payload, key, desiredStart) {
  clearBlockPreviews();
  let item;
  let ignoreId = null;
  if (payload?.type === "template") {
    const template = allTemplates().find((entry) => entry.id === payload.templateId);
    if (!template) return desiredStart;
    item = { ...template, instanceId: "preview" };
  } else if (payload?.type === "block") {
    item = schedule[payload.sourceDate]?.find((entry) => entry.instanceId === payload.instanceId);
    if (!item) return desiredStart;
    if (payload.sourceDate === key) ignoreId = item.instanceId;
  } else {
    return desiredStart;
  }

  const previous = payload.lastDesired ?? payload.originStart ?? desiredStart;
  if (desiredStart > previous) payload.direction = 1;
  if (desiredStart < previous) payload.direction = -1;
  payload.lastDesired = desiredStart;
  const plan = buildPushPlan(key, item, desiredStart, payload.direction || 1, ignoreId);
  if (!plan) return desiredStart;

  applyPlanPreview(key, plan, ignoreId);
  return plan.movingStart;
}

function nextAvailableStart(key, duration) {
  ensureDay(key);
  sortDay(key);
  let cursor = DAY_START;
  for (const block of schedule[key]) {
    if (block.start - cursor >= duration) return cursor;
    cursor = Math.max(cursor, block.start + block.duration);
  }
  return clampStart(cursor, duration);
}

function cascadeAfter(key, instanceId) {
  sortDay(key);
  const items = schedule[key];
  const index = items.findIndex((block) => block.instanceId === instanceId);
  if (index < 0) return;
  let cursor = items[index].start + items[index].duration;
  for (let position = index + 1; position < items.length; position += 1) {
    const block = items[position];
    if (block.start < cursor) block.start = snap(cursor);
    if (block.start + block.duration > DAY_END) block.start = Math.max(DAY_START, DAY_END - block.duration);
    cursor = block.start + block.duration;
  }
  sortDay(key);
}

function renderPalette() {
  $("#activity-grid").innerHTML = allTemplates().map((item) => `
    <article class="activity-card" draggable="${!layoutLocked && !activityEditMode}" tabindex="0" data-template-id="${item.id}" style="--accent:var(--signal-${item.signal})" aria-label="${escapeHtml(item.name)}, ${formatDuration(item.duration)}. ${activityEditMode ? "Click to edit." : "Drag into the week or double-click for the next open slot."}">
      <span class="activity-name">${escapeHtml(item.name)}</span>
      <span class="activity-time">${formatDuration(item.duration)}</span>
      <button class="activity-edit" type="button" aria-label="Edit ${escapeHtml(item.name)}">EDIT</button>
    </article>
  `).join("");

  $$(".activity-card").forEach((card) => {
    card.addEventListener("dragstart", (event) => {
      if (layoutLocked || activityEditMode || event.target.closest(".activity-edit")) {
        event.preventDefault();
        return;
      }
      dragPayload = { type: "template", templateId: card.dataset.templateId };
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("text/plain", JSON.stringify(dragPayload));
      card.style.opacity = ".32";
    });
    card.addEventListener("dragend", () => {
      card.style.opacity = "";
      dragPayload = null;
      clearDropStates(true);
    });
    card.addEventListener("dblclick", (event) => {
      if (event.target.closest(".activity-edit")) return;
      if (activityEditMode) return;
      if (layoutLocked) return showToast("LAYOUT LOCKED");
      ensureDay(activeDate);
      const template = findTemplate(card.dataset.templateId);
      if (!template) return;
      recordHistory();
      const start = nextAvailableStart(activeDate, template.duration);
      schedule[activeDate].push(blockFrom(template, start));
      sortDay(activeDate);
      save();
      render();
      showToast(`${template.name.toUpperCase()} // ${formatClock(start)}`);
    });
    card.addEventListener("click", (event) => {
      if (!activityEditMode || event.target.closest(".activity-edit")) return;
      event.preventDefault();
      openModal(card.dataset.templateId);
    });
    card.addEventListener("keydown", (event) => {
      if (!activityEditMode || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      openModal(card.dataset.templateId);
    });
    card.querySelector(".activity-edit").addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openModal(card.dataset.templateId);
    });
  });
}

function renderHeader() {
  const dates = weekDates();
  const first = dates[0];
  const last = dates[6];
  $("#date-label strong").textContent = `${first.toLocaleDateString(undefined, { month: "short", day: "numeric" })} — ${last.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  $("#today-button")?.classList.toggle("active", dates.some((date) => dateKey(date) === dateKey(new Date())));
}

function currentTimelineMoment() {
  const now = new Date();
  const rawMinutes = now.getHours() * 60 + now.getMinutes();
  const beforeDayStart = rawMinutes < DAY_START;
  return {
    date: beforeDayStart ? addDays(now, -1) : now,
    minutes: beforeDayStart ? rawMinutes + 24 * 60 : rawMinutes
  };
}

function renderRuler() {
  const moment = currentTimelineMoment();
  const currentWeek = weekDates().some((date) => dateKey(date) === dateKey(moment.date));
  const ticks = [];
  for (let minutes = 0; minutes <= DAY_MINUTES; minutes += SNAP) {
    const absolute = DAY_START + minutes;
    const isHour = minutes % 60 === 0;
    const isMajor = minutes % 180 === 0;
    const isEnd = minutes === DAY_MINUTES;
    const isMidnight = absolute === 24 * 60;
    ticks.push(`<i class="time-tick ${isHour ? "hour" : "quarter"} ${isMajor ? "major" : ""} ${isMidnight ? "midnight" : ""} ${isEnd ? "end" : ""}" style="left:${minutes / DAY_MINUTES * 100}%">${isHour ? `<span>${formatClock(absolute, true)}</span>` : ""}</i>`);
  }
  const nowMarker = currentWeek
    ? `<div class="ruler-now" style="left:${(moment.minutes - DAY_START) / DAY_MINUTES * 100}%"><span>NOW ${formatRailTime(moment.minutes)}</span></div>` : "";
  $("#time-ruler").innerHTML = ticks.join("") + nowMarker;
}

function linkedSleepMinutes(block) {
  if (block.templateId !== "sleep" || block.sleepSegment !== "morning" || !block.sleepWrapId) return 0;
  return Object.values(schedule).reduce((total, blocks) => total + (Array.isArray(blocks)
    ? blocks
      .filter((entry) => entry.templateId === "sleep" && entry.sleepWrapId === block.sleepWrapId)
      .reduce((sum, entry) => sum + entry.duration, 0)
    : 0), 0);
}

function formatSleepHours(minutes) {
  const hours = Math.round(minutes / 15) / 4;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(2).replace(/0$/, "")}H`;
}

function blockMarkup(block, key) {
  const left = (block.start - DAY_START) / DAY_MINUTES * 100;
  const width = block.duration / DAY_MINUTES * 100;
  const sleepMinutes = linkedSleepMinutes(block);
  const displayName = sleepMinutes ? `${formatSleepHours(sleepMinutes)} SLEEP` : block.name;
  const totalDescription = sleepMinutes ? `, ${formatDuration(sleepMinutes)} total sleep` : "";
  return `<article class="schedule-block" draggable="${!layoutLocked}" data-instance-id="${block.instanceId}" data-source-date="${key}" data-template-id="${escapeHtml(block.templateId || "")}" style="--accent:var(--signal-${block.signal});--left:${left}%;--width:${width}%" title="${escapeHtml(displayName)}" aria-label="${escapeHtml(block.name)}${totalDescription}, ${formatClock(block.start)} to ${formatClock(block.start + block.duration)}">
    <span class="resize-handle top" data-edge="top" title="Drag to grow across earlier days" aria-label="Grow ${escapeHtml(block.name)} across earlier days"></span>
    <span class="resize-handle left" data-edge="left" title="Drag to adjust start" aria-label="Adjust start of ${escapeHtml(block.name)}"></span>
    <span class="block-label"><strong class="block-name">${escapeHtml(displayName)}</strong></span>
    <span class="resize-handle right" data-edge="right" title="Drag to adjust end" aria-label="Adjust end of ${escapeHtml(block.name)}"></span>
    <span class="resize-handle bottom" data-edge="bottom" title="Drag to grow across later days" aria-label="Grow ${escapeHtml(block.name)} across later days"></span>
  </article>`;
}

function renderWeek() {
  const moment = currentTimelineMoment();
  const todayKey = dateKey(moment.date);

  $("#day-lanes").innerHTML = weekDates().map((date, index) => {
    const key = dateKey(date);
    ensureDay(key);
    sortDay(key);
    const dayTotal = schedule[key].reduce((sum, block) => sum + block.duration, 0);
    const load = Math.min(100, dayTotal / DAY_MINUTES * 100);
    const accent = `var(--signal-${index % 8})`;
    const nowLine = key === todayKey
      ? `<div class="track-now" style="left:${(moment.minutes - DAY_START) / DAY_MINUTES * 100}%"></div>` : "";
    return `<section class="day-row ${key === todayKey ? "is-today" : ""} ${key === activeDate ? "is-active" : ""}" data-row-date="${key}">
      <div class="day-label" style="--day-accent:${accent};--load:${load}%">
        <button class="day-activate" data-activate-date="${key}">
          <strong>${dayNames[date.getDay()]}</strong>
          <span>${date.toLocaleDateString(undefined, { month: "short" }).toUpperCase()} ${date.getDate()}</span>
          <small>${formatDuration(dayTotal)} PLANNED</small>
        </button>
        <button class="day-actions-button" data-day-actions="${key}" aria-label="Actions for ${dayNames[date.getDay()]}">•••</button>
      </div>
      <div class="day-track ${schedule[key].length ? "" : "empty"}" data-track-date="${key}">${nowLine}${schedule[key].map((block) => blockMarkup(block, key)).join("")}</div>
    </section>`;
  }).join("");

  ensureDay(activeDate);
  const totalBlocks = schedule[activeDate].length;
  const totalMinutes = schedule[activeDate].reduce((sum, block) => sum + block.duration, 0);
  $("#total-blocks").textContent = String(totalBlocks).padStart(2, "0");
  $("#total-hours").textContent = formatDuration(totalMinutes).replace(":", "H ").replace(/ 00$/, "");
  $("#open-hours").textContent = formatDuration(Math.max(0, DAY_MINUTES - totalMinutes)).replace(":", "H ").replace(/ 00$/, "");
  oceanLoad = Math.min(1, totalMinutes / DAY_MINUTES);

  $$("[data-activate-date]").forEach((button) => button.addEventListener("click", () => {
    activeDate = button.dataset.activateDate;
    save();
    renderWeek();
  }));
  $$("[data-day-actions]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    openDayMenu(button.dataset.dayActions, button);
  }));
  $$(".day-track").forEach(bindTrackDrop);
  $$(".schedule-block").forEach(bindScheduleBlock);
}

function bindScheduleBlock(element) {
  element.addEventListener("dragstart", (event) => {
    if (layoutLocked || event.target.closest(".resize-handle")) {
      event.preventDefault();
      if (layoutLocked) showToast("LAYOUT LOCKED");
      return;
    }
    const block = schedule[element.dataset.sourceDate]?.find((item) => item.instanceId === element.dataset.instanceId);
    if (!block) return;
    const rect = element.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
    dragPayload = {
      type: "block",
      instanceId: element.dataset.instanceId,
      sourceDate: element.dataset.sourceDate,
      grabOffset: snap(block.duration * ratio),
      originStart: block.start,
      lastDesired: block.start,
      direction: 1
    };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", JSON.stringify(dragPayload));
    $(".palette").classList.add("removal-ready");
    requestAnimationFrame(() => element.classList.add("dragging"));
  });
  element.addEventListener("dragend", () => {
    element.classList.remove("dragging");
    dragPayload = null;
    clearDropStates(true);
  });
  element.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (layoutLocked) return showToast("LAYOUT LOCKED");
    removeBlock(element.dataset.sourceDate, element.dataset.instanceId);
  });
  bindResize(element);
}

function bindResize(element) {
  element.querySelectorAll(".resize-handle.left, .resize-handle.right").forEach((handle) => handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (layoutLocked) return showToast("LAYOUT LOCKED");
    const key = element.dataset.sourceDate;
    const block = schedule[key].find((item) => item.instanceId === element.dataset.instanceId);
    const track = element.closest(".day-track");
    if (!block || !track) return;
    recordHistory();
    const linkedOccurrences = block.verticalGroupId ? groupOccurrences(block) : [{ block, key }];
    let previousEnd = DAY_START;
    let nextStart = DAY_END;
    linkedOccurrences.forEach((occurrence) => {
      sortDay(occurrence.key);
      const index = schedule[occurrence.key].findIndex((item) => item.instanceId === occurrence.block.instanceId);
      const before = index > 0 ? schedule[occurrence.key][index - 1].start + schedule[occurrence.key][index - 1].duration : DAY_START;
      const after = index < schedule[occurrence.key].length - 1 ? schedule[occurrence.key][index + 1].start : DAY_END;
      previousEnd = Math.max(previousEnd, before);
      nextStart = Math.min(nextStart, after);
    });
    const edge = handle.dataset.edge;
    const startX = event.clientX;
    const initialStart = block.start;
    const initialDuration = block.duration;
    const fixedEnd = initialStart + initialDuration;
    element.setAttribute("draggable", "false");
    handle.setPointerCapture(event.pointerId);

    const move = (moveEvent) => {
      const deltaMinutes = snap((moveEvent.clientX - startX) / track.clientWidth * DAY_MINUTES);
      if (edge === "left") {
        block.start = Math.max(previousEnd, Math.min(fixedEnd - SNAP, initialStart + deltaMinutes));
        block.duration = fixedEnd - block.start;
      } else {
        block.duration = Math.max(SNAP, Math.min(nextStart - block.start, initialDuration + deltaMinutes));
      }
      element.style.setProperty("--left", `${(block.start - DAY_START) / DAY_MINUTES * 100}%`);
      element.style.setProperty("--width", `${block.duration / DAY_MINUTES * 100}%`);
    };

    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      element.setAttribute("draggable", "true");
      linkedOccurrences.forEach((occurrence) => {
        occurrence.block.start = block.start;
        occurrence.block.duration = block.duration;
        sortDay(occurrence.key);
      });
      linkedOccurrences.forEach((occurrence) => syncSleepMorningWrap(occurrence.block, occurrence.key));
      save();
      render();
      showToast(`RESIZED // ${formatClock(block.start)}—${formatClock(block.start + block.duration)}`);
    };

    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }));
  bindVerticalResize(element);
}

function groupOccurrences(block) {
  if (!block.verticalGroupId) return [];
  return weekDates().flatMap((date, index) => {
    const key = dateKey(date);
    return (schedule[key] || [])
      .filter((entry) => entry.verticalGroupId === block.verticalGroupId)
      .map((entry) => ({ block: entry, key, index }));
  });
}

function lockedPushPlan(key, item) {
  const right = buildPushPlan(key, item, item.start, 1);
  if (right?.movingStart === item.start) return right;
  const left = buildPushPlan(key, item, item.start, -1);
  return left?.movingStart === item.start ? left : null;
}

function dayIndexFromPointer(clientX, clientY) {
  const rows = $$(".day-row");
  if (!rows.length) return 0;
  const pointed = document.elementFromPoint(clientX, clientY)?.closest(".day-row");
  if (pointed) return Math.max(0, rows.indexOf(pointed));
  if (clientY <= rows[0].getBoundingClientRect().top) return 0;
  if (clientY >= rows[rows.length - 1].getBoundingClientRect().bottom) return rows.length - 1;
  return rows.reduce((best, row, index) => {
    const rect = row.getBoundingClientRect();
    const distance = Math.abs(clientY - (rect.top + rect.bottom) / 2);
    return distance < best.distance ? { index, distance } : best;
  }, { index: 0, distance: Infinity }).index;
}

function previewVerticalRange(canonical, groupId, startIndex, endIndex) {
  clearBlockPreviews();
  const keys = weekDates().map(dateKey);
  keys.forEach((key, index) => {
    const existing = (schedule[key] || []).find((entry) => entry.verticalGroupId === groupId);
    const inRange = index >= startIndex && index <= endIndex;
    if (existing && !inRange) {
      document.querySelector(`[data-instance-id="${existing.instanceId}"]`)?.classList.add("vertical-remove-preview");
      return;
    }
    if (!inRange) return;
    const track = document.querySelector(`[data-track-date="${key}"]`);
    if (!track) return;
    track.classList.add("vertical-resize-target");
    if (existing) return;
    const ghostItem = { ...canonical, instanceId: "vertical-preview", verticalGroupId: groupId };
    const plan = lockedPushPlan(key, ghostItem);
    if (!plan) return;
    applyPlanPreview(key, plan);
    const ghost = document.createElement("article");
    ghost.className = "schedule-block vertical-ghost";
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.setProperty("--accent", `var(--signal-${canonical.signal})`);
    ghost.style.setProperty("--left", `${(canonical.start - DAY_START) / DAY_MINUTES * 100}%`);
    ghost.style.setProperty("--width", `${canonical.duration / DAY_MINUTES * 100}%`);
    ghost.innerHTML = `<span class="block-label"><strong class="block-name">${escapeHtml(canonical.name)}</strong></span>`;
    track.appendChild(ghost);
  });
}

function applyVerticalRange(canonical, groupId, startIndex, endIndex) {
  const keys = weekDates().map(dateKey);
  keys.forEach((key, index) => {
    ensureDay(key);
    if (index < startIndex || index > endIndex) {
      schedule[key]
        .filter((entry) => entry.verticalGroupId === groupId)
        .forEach((entry) => removeSleepCounterpart(key, entry));
      schedule[key] = schedule[key].filter((entry) => entry.verticalGroupId !== groupId);
    }
  });

  let count = 0;
  keys.slice(startIndex, endIndex + 1).forEach((key) => {
    ensureDay(key);
    let occurrence = schedule[key].find((entry) => entry.verticalGroupId === groupId);
    if (!occurrence) {
      const clone = { ...canonical, instanceId: uid(), verticalGroupId: groupId };
      if (clone.templateId === "sleep") {
        delete clone.sleepWrapId;
        delete clone.sleepSegment;
      }
      const plan = lockedPushPlan(key, clone);
      if (!plan) return;
      plan.blocks.forEach((planned) => {
        const existing = schedule[key].find((entry) => entry.instanceId === planned.instanceId);
        if (existing) existing.start = planned.start;
      });
      clone.start = canonical.start;
      schedule[key].push(clone);
      occurrence = clone;
    }
    occurrence.verticalGroupId = groupId;
    occurrence.start = canonical.start;
    occurrence.duration = canonical.duration;
    sortDay(key);
    syncSleepMorningWrap(occurrence, key);
    count += 1;
  });
  return count;
}

function bindVerticalResize(element) {
  element.querySelectorAll(".resize-handle.top, .resize-handle.bottom").forEach((handle) => handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (layoutLocked) return showToast("LAYOUT LOCKED");
    const key = element.dataset.sourceDate;
    const block = schedule[key]?.find((entry) => entry.instanceId === element.dataset.instanceId);
    if (!block) return;
    recordHistory();
    const canonical = { ...block };
    const groupId = block.verticalGroupId || uid();
    block.verticalGroupId = groupId;
    const occurrences = groupOccurrences(block);
    const sourceIndex = weekDates().map(dateKey).indexOf(key);
    const initialStart = occurrences.length ? Math.min(...occurrences.map((entry) => entry.index)) : sourceIndex;
    const initialEnd = occurrences.length ? Math.max(...occurrences.map((entry) => entry.index)) : sourceIndex;
    const edge = handle.dataset.edge;
    const anchor = edge === "top" ? initialEnd : initialStart;
    let proposedStart = initialStart;
    let proposedEnd = initialEnd;
    element.setAttribute("draggable", "false");
    handle.setPointerCapture(event.pointerId);

    const move = (moveEvent) => {
      const targetIndex = dayIndexFromPointer(moveEvent.clientX, moveEvent.clientY);
      if (edge === "top") {
        proposedStart = Math.min(anchor, targetIndex);
        proposedEnd = anchor;
      } else {
        proposedStart = anchor;
        proposedEnd = Math.max(anchor, targetIndex);
      }
      previewVerticalRange(canonical, groupId, proposedStart, proposedEnd);
    };

    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      element.setAttribute("draggable", "true");
      clearBlockPreviews();
      canonical.verticalGroupId = groupId;
      const count = applyVerticalRange(canonical, groupId, proposedStart, proposedEnd);
      save();
      render();
      showToast(`${canonical.name.toUpperCase()} // ${count} DAY${count === 1 ? "" : "S"}`);
    };

    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }));
}

function startFromPointer(event, track) {
  const rect = track.getBoundingClientRect();
  const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
  return snap(DAY_START + x / rect.width * DAY_MINUTES);
}

function parseDragPayload(event) {
  if (dragPayload) return dragPayload;
  try { return JSON.parse(event.dataTransfer.getData("text/plain")); } catch { return null; }
}

function dropStartFromPointer(event, track, payload) {
  const pointerStart = startFromPointer(event, track);
  return pointerStart - (payload?.type === "block" ? payload.grabOffset || 0 : 0);
}

function bindTrackDrop(track) {
  track.ondragover = (event) => {
    if (layoutLocked) return;
    event.preventDefault();
    track.classList.add("drag-over");
    activeDate = track.dataset.trackDate;
    const payload = parseDragPayload(event);
    const desiredStart = dropStartFromPointer(event, track, payload);
    const start = previewPush(payload, track.dataset.trackDate, desiredStart);
    let clock = track.querySelector(".drop-clock");
    if (!clock) {
      clock = document.createElement("span");
      clock.className = "drop-clock";
      track.appendChild(clock);
    }
    clock.textContent = formatRailTime(start);
    clock.style.left = `${(start - DAY_START) / DAY_MINUTES * 100}%`;
    event.dataTransfer.dropEffect = dragPayload?.type === "template" ? "copy" : "move";
  };
  track.ondragleave = (event) => {
    if (!track.contains(event.relatedTarget)) clearDropStates();
  };
  track.ondrop = (event) => {
    if (layoutLocked) return showToast("LAYOUT LOCKED");
    event.preventDefault();
    const payload = parseDragPayload(event);
    if (!payload) return;
    activeDate = track.dataset.trackDate;
    completeDrop(payload, activeDate, dropStartFromPointer(event, track, payload));
    clearDropStates(true);
  };
}

function sleepCounterpartDetails(key, item) {
  if (!item?.sleepWrapId || !item.sleepSegment) return null;
  const isMorning = item.sleepSegment === "morning";
  return {
    key: dateKey(addDays(dateFromKey(key), isMorning ? -1 : 1)),
    segment: isMorning ? "night" : "morning"
  };
}

function removeSleepCounterpart(key, item) {
  const counterpart = sleepCounterpartDetails(key, item);
  if (!counterpart) return;
  ensureDay(counterpart.key);
  schedule[counterpart.key] = schedule[counterpart.key].filter((entry) => !(
    entry.sleepWrapId === item.sleepWrapId
    && entry.sleepSegment === counterpart.segment
  ));
}

function removeSleepPair(key, item, removeSource = true) {
  removeSleepCounterpart(key, item);
  if (removeSource) {
    schedule[key] = (schedule[key] || []).filter((entry) => entry.instanceId !== item.instanceId);
  }
}

function syncSleepMorningWrap(item, key) {
  if (item.templateId !== "sleep" || item.sleepSegment === "morning") return null;
  if (item.start + item.duration === DAY_END) return addSleepMorningWrap(item, key);
  removeSleepCounterpart(key, item);
  delete item.sleepWrapId;
  delete item.sleepSegment;
  return null;
}

function addSleepMorningWrap(item, targetDate) {
  if (item.templateId !== "sleep" || item.start + item.duration !== DAY_END) return null;
  let wrapId = item.sleepWrapId || uid();
  const wrapCollision = Object.values(schedule).some((blocks) => (blocks || []).some((block) => (
    block.instanceId !== item.instanceId
    && block.sleepWrapId === wrapId
    && block.sleepSegment === "night"
  )));
  if (wrapCollision) {
    removeSleepCounterpart(targetDate, item);
    wrapId = uid();
  }
  const nextDate = addDays(dateFromKey(targetDate), 1);
  const nextKey = dateKey(nextDate);
  ensureDay(nextKey);
  item.sleepWrapId = wrapId;
  item.sleepSegment = "night";

  const existing = schedule[nextKey].find((block) => block.sleepWrapId === wrapId && block.sleepSegment === "morning");
  if (existing) return { key: nextKey, block: existing };

  const template = findTemplate("sleep") || DEFAULT_PALETTE.find((entry) => entry.id === "sleep");
  const morning = blockFrom(template, DAY_START);
  morning.duration = 60;
  morning.sleepWrapId = wrapId;
  morning.sleepSegment = "morning";
  const plan = buildPushPlan(nextKey, morning, DAY_START, 1);
  if (plan) {
    plan.blocks.forEach((planned) => {
      const pushed = schedule[nextKey].find((block) => block.instanceId === planned.instanceId);
      if (pushed) pushed.start = planned.start;
    });
    morning.start = plan.movingStart;
  } else {
    morning.start = nearestAvailableStart(nextKey, DAY_START, morning.duration);
  }
  schedule[nextKey].push(morning);
  sortDay(nextKey);
  return { key: nextKey, block: morning };
}

function completeDrop(payload, targetDate, desiredStart) {
  if (layoutLocked) return showToast("LAYOUT LOCKED");
  ensureDay(targetDate);
  recordHistory();
  let item;
  if (payload.type === "template") {
    const template = allTemplates().find((entry) => entry.id === payload.templateId);
    if (!template) return;
    item = blockFrom(template, desiredStart);
  } else {
    ensureDay(payload.sourceDate);
    const index = schedule[payload.sourceDate].findIndex((entry) => entry.instanceId === payload.instanceId);
    if (index < 0) return;
    [item] = schedule[payload.sourceDate].splice(index, 1);
    delete item.verticalGroupId;
    if (item.sleepWrapId) {
      removeSleepCounterpart(payload.sourceDate, item);
      delete item.sleepWrapId;
      delete item.sleepSegment;
      item.duration = findTemplate("sleep")?.duration || 60;
    }
  }
  const snappedStart = clampStart(desiredStart, item.duration);
  if (item.templateId === "sleep" && snappedStart >= 23 * 60 && snappedStart < 24 * 60) {
    item.duration = DAY_END - snappedStart;
  }
  const plan = buildPushPlan(targetDate, item, desiredStart, payload.direction || 1);
  if (plan) {
    plan.blocks.forEach((planned) => {
      const existing = schedule[targetDate].find((block) => block.instanceId === planned.instanceId);
      if (existing) existing.start = planned.start;
    });
    item.start = plan.movingStart;
  } else {
    item.start = nearestAvailableStart(targetDate, desiredStart, item.duration);
  }
  schedule[targetDate].push(item);
  sortDay(targetDate);
  const sleepWrap = addSleepMorningWrap(item, targetDate);
  save();
  render();
  if (sleepWrap) {
    const wrapDate = dateFromKey(sleepWrap.key);
    showToast(`SLEEP // WRAPS TO ${dayNames[wrapDate.getDay()]} ${formatRailTime(sleepWrap.block.start)}`);
  } else {
    showToast(`${item.name.toUpperCase()} // ${formatClock(item.start)}`);
  }
}

function removeBlock(key, instanceId) {
  if (layoutLocked) return showToast("LAYOUT LOCKED");
  const item = schedule[key]?.find((block) => block.instanceId === instanceId);
  if (!item) return;
  recordHistory();
  if (item.sleepWrapId && item.sleepSegment) {
    removeSleepPair(key, item);
  } else {
    schedule[key] = (schedule[key] || []).filter((block) => block.instanceId !== instanceId);
  }
  save();
  render();
  showToast(item.sleepWrapId ? "SLEEP PAIR // REMOVED" : `${(item?.name || "BLOCK").toUpperCase()} // REMOVED`);
}

function clearDropStates(finish = false) {
  $$(".drag-over").forEach((element) => element.classList.remove("drag-over"));
  $$(".drop-clock").forEach((element) => element.remove());
  clearBlockPreviews();
  if (finish) $(".palette").classList.remove("removal-ready", "remove-hover");
}

function dailyChapterIndex(day) {
  let hash = 216;
  for (const character of day) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % Math.max(1, (window.TAO_CHAPTERS || []).length);
}

function renderReflectionMode() {
  const visual = reflectionMode !== "tao";
  const meditationCard = $("#meditation-card");
  const chapterCard = $("#chapter-card");
  if (meditationCard) meditationCard.hidden = !visual;
  if (chapterCard) chapterCard.hidden = visual;
  if (visual) {
    $("#meditation-number").textContent = String(meditationState.pattern + 1).padStart(2, "0");
    $("#meditation-name").textContent = MEDITATION_NAMES[meditationState.pattern];
  }
}

function setReflectionMode(mode) {
  reflectionMode = mode === "tao" ? "tao" : "visual";
  save();
  renderReflectionMode();
  renderChapter();
  if (reflectionMode === "visual") meditationController?.resume();
}

function restartMeditation({ newSeed = false } = {}) {
  if (newSeed) meditationState.seed = Math.floor(Math.random() * 1_000_000_000);
  save();
  renderReflectionMode();
  meditationController?.restart();
}

function changeMeditation() {
  meditationState.pattern = (meditationState.pattern + 1) % MEDITATION_NAMES.length;
  restartMeditation({ newSeed: true });
}

function initializeDailyChapter() {
  const today = dateKey(new Date());
  const chapters = window.TAO_CHAPTERS || [];
  if (!chapters.length) return;
  if (chapterState.date !== today || !Number.isInteger(chapterState.index) || !chapters[chapterState.index]) {
    chapterState = { date: today, index: dailyChapterIndex(today) };
    save();
  }
}

function renderChapter() {
  const chapters = window.TAO_CHAPTERS || [];
  const card = $("#chapter-card");
  if (reflectionMode !== "tao") {
    if (card) card.hidden = true;
    return;
  }
  if (!card || !chapters.length) {
    if (card) card.hidden = true;
    return;
  }
  initializeDailyChapter();
  const chapter = chapters[chapterState.index];
  card.hidden = false;
  $("#chapter-number").textContent = String(chapter.number).padStart(2, "0");
  $("#chapter-copy").innerHTML = chapter.blocks.map((block) => {
    if (block.type === "verse") {
      return `<div class="chapter-stanza">${block.lines.map((line) => `<span class="chapter-line">${escapeHtml(line)}</span>`).join("")}</div>`;
    }
    return `<p>${escapeHtml(block.text)}</p>`;
  }).join("");
  $("#chapter-credit").textContent = "JAMES LEGGE · 1891";
  $("#chapter-paper").setAttribute("aria-label", `Chapter ${chapter.number}`);
}

function showChapter(index) {
  const length = (window.TAO_CHAPTERS || []).length;
  if (!length) return;
  chapterState.index = (index + length) % length;
  chapterState.date = dateKey(new Date());
  save();
  renderChapter();
}

function setupChapterCard() {
  $("#previous-chapter").addEventListener("click", () => showChapter(chapterState.index - 1));
  $("#next-chapter").addEventListener("click", () => showChapter(chapterState.index + 1));
  $("#random-chapter").addEventListener("click", () => {
    const length = (window.TAO_CHAPTERS || []).length;
    if (!length) return;
    let next = Math.floor(Math.random() * length);
    if (length > 1 && next === chapterState.index) next = (next + 1) % length;
    showChapter(next);
  });
  $("#show-meditation").addEventListener("click", () => setReflectionMode("visual"));
}

function setupMeditation() {
  const canvas = $("#meditation-canvas");
  const surface = canvas.closest(".meditation-surface");
  const context = canvas.getContext("2d");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let width = 0;
  let height = 0;
  let ratio = 1;
  let drawn = 0;
  let startTime = performance.now();
  let lastFrame = startTime;
  let activeKey = "";
  let fernX = 0;
  let fernY = 0;
  let attractorX = .1;
  let attractorY = .1;
  let random = () => .5;
  let previousPoint = null;
  let running = true;

  const mulberry32 = (seed) => () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };

  const colors = () => ({
    hacker: { primary: "rgba(116,243,140,.76)", secondary: "rgba(153,91,214,.66)", point: "rgba(183,255,101,.64)", tertiary: "rgba(222,74,161,.5)" },
    earth: { primary: "rgba(129,161,91,.78)", secondary: "rgba(191,111,65,.64)", point: "rgba(211,178,113,.68)", tertiary: "rgba(67,139,126,.57)" },
    ocean: { primary: "rgba(133,239,231,.76)", secondary: "rgba(174,152,232,.66)", point: "rgba(98,192,222,.68)", tertiary: "rgba(238,139,184,.5)" },
    dream: { primary: "rgba(255,101,171,.78)", secondary: "rgba(155,116,255,.7)", point: "rgba(107,241,205,.72)", tertiary: "rgba(210,238,90,.62)" },
    velvet: { primary: "rgba(208,158,91,.74)", secondary: "rgba(152,73,103,.68)", point: "rgba(109,142,105,.65)", tertiary: "rgba(112,86,139,.58)" }
  }[currentTheme]);

  const patternLimit = () => [18_000, 30_000, 16_000, 18_000, 35_000, 12_000][meditationState.pattern];
  const patternRate = () => [75, 125, 170, 140, 260, 110][meditationState.pattern];

  const resize = () => {
    const rect = surface.getBoundingClientRect();
    ratio = Math.min(2, window.devicePixelRatio || 1);
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    activeKey = "";
  };

  const reset = () => {
    context.clearRect(0, 0, width, height);
    drawn = 0;
    fernX = 0;
    fernY = 0;
    attractorX = .1;
    attractorY = .1;
    previousPoint = null;
    random = mulberry32(meditationState.seed);
    startTime = performance.now();
    lastFrame = startTime;
    activeKey = `${meditationState.pattern}:${meditationState.seed}:${currentTheme}:${Math.round(width)}:${Math.round(height)}`;
    running = true;
  };

  const pendulumPoint = (index) => {
    const time = index * .012;
    const fade = Math.exp(-index / 29_000);
    const phase = (meditationState.seed % 628) / 100;
    const x = Math.sin(2.013 * time + phase) * .32 * fade + Math.sin(3.017 * time) * .11 * fade;
    const y = Math.sin(1.997 * time) * .3 * fade + Math.sin(2.981 * time + phase * .7) * .12 * fade;
    return { x: width * (.5 + x), y: height * (.5 + y) };
  };

  const orbitalPoint = (index) => {
    const time = index * .016;
    const phase = (meditationState.seed % 523) / 83;
    const petals = 5 + meditationState.seed % 4;
    const radius = Math.min(width, height) * (.28 + .055 * Math.sin(time * .021));
    const ripple = Math.cos(petals * time + phase) * radius * .31;
    return {
      x: width * .5 + Math.cos(time) * (radius + ripple),
      y: height * .5 + Math.sin(time) * (radius + ripple) * .92
    };
  };

  const tidalPoint = (index) => {
    const time = index * .018;
    const phase = (meditationState.seed % 719) / 91;
    const radius = Math.min(width, height) * (.23 + .085 * Math.sin(time * .067));
    const braided = Math.sin(time * 7 + phase) * radius * .2;
    return {
      x: width * .5 + Math.cos(time + Math.sin(time * .013) * .7) * (radius + braided),
      y: height * .5 + Math.sin(time) * (radius - braided) * .93
    };
  };

  const colorAt = (index, stride = 96) => {
    const ink = colors();
    return [ink.primary, ink.secondary, ink.point, ink.tertiary][Math.floor(index / stride) % 4];
  };

  const drawLinePattern = (target, pointAt) => {
    while (drawn < target) {
      const chunkStart = drawn;
      const chunkEnd = Math.min(target, drawn + 48);
      context.beginPath();
      if (previousPoint) context.moveTo(previousPoint.x, previousPoint.y);
      for (; drawn < chunkEnd; drawn += 1) {
        const point = pointAt(drawn);
        if (!previousPoint) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
        previousPoint = point;
      }
      context.strokeStyle = colorAt(chunkStart);
      context.lineWidth = meditationState.pattern === 0 ? .58 : .68;
      context.shadowColor = context.strokeStyle;
      context.shadowBlur = 3;
      context.stroke();
    }
    context.shadowBlur = 0;
  };

  const drawFern = (target) => {
    for (; drawn < target; drawn += 1) {
      if (drawn % 48 === 0) context.fillStyle = colorAt(drawn, 192);
      const roll = random();
      let nextX;
      let nextY;
      if (roll < .01) { nextX = 0; nextY = .16 * fernY; }
      else if (roll < .86) { nextX = .85 * fernX + .04 * fernY; nextY = -.04 * fernX + .85 * fernY + 1.6; }
      else if (roll < .93) { nextX = .2 * fernX - .26 * fernY; nextY = .23 * fernX + .22 * fernY + 1.6; }
      else { nextX = -.15 * fernX + .28 * fernY; nextY = .26 * fernX + .24 * fernY + .44; }
      fernX = nextX;
      fernY = nextY;
      const x = width * .5 + fernX * width * .085;
      const y = height * .94 - fernY * height * .091;
      context.fillRect(x, y, .9, .9);
    }
  };

  const drawAttractor = (target) => {
    const seed = meditationState.seed;
    const a = -1.72 + (seed % 37) / 100;
    const b = 1.63 + (seed % 29) / 100;
    const c = .72 + (seed % 31) / 100;
    const d = 1.18 + (seed % 23) / 100;
    for (; drawn < target; drawn += 1) {
      if (drawn % 72 === 0) context.fillStyle = colorAt(drawn, 504);
      const nextX = Math.sin(a * attractorY) + c * Math.cos(a * attractorX);
      const nextY = Math.sin(b * attractorX) + d * Math.cos(b * attractorY);
      attractorX = nextX;
      attractorY = nextY;
      const x = width * .5 + nextX * width * .18;
      const y = height * .51 + nextY * height * .17;
      context.fillRect(x, y, .72, .72);
    }
  };

  const drawGoldenGarden = (target) => {
    const limit = patternLimit();
    const golden = Math.PI * (3 - Math.sqrt(5));
    const phase = (meditationState.seed % 628) / 100;
    const scale = Math.min(width, height) * .43;
    for (; drawn < target; drawn += 1) {
      if (drawn % 38 === 0) context.fillStyle = colorAt(drawn, 152);
      const radius = Math.sqrt((drawn + 1) / limit) * scale;
      const angle = drawn * golden + phase;
      const x = width * .5 + Math.cos(angle) * radius;
      const y = height * .5 + Math.sin(angle) * radius;
      const size = .7 + (drawn / limit) * 1.05;
      context.beginPath();
      context.arc(x, y, size, 0, Math.PI * 2);
      context.fill();
    }
  };

  const frame = (timestamp) => {
    const key = `${meditationState.pattern}:${meditationState.seed}:${currentTheme}:${Math.round(width)}:${Math.round(height)}`;
    if (key !== activeKey) reset();
    if (reflectionMode === "visual" && running) {
      const limit = patternLimit();
      const elapsed = timestamp - startTime;
      const target = reducedMotion ? limit : Math.min(limit, Math.floor(elapsed / 1000 * patternRate()));
      if (target > drawn) {
        if (meditationState.pattern === 0) drawLinePattern(target, pendulumPoint);
        else if (meditationState.pattern === 1) drawFern(target);
        else if (meditationState.pattern === 2) drawLinePattern(target, orbitalPoint);
        else if (meditationState.pattern === 3) drawLinePattern(target, tidalPoint);
        else if (meditationState.pattern === 4) drawAttractor(target);
        else drawGoldenGarden(target);
      }
      if (drawn >= limit) running = false;
    }
    lastFrame = timestamp;
    if (!reducedMotion) requestAnimationFrame(frame);
  };

  meditationController = {
    restart: reset,
    resume: () => {
      if (!running) return;
      startTime += performance.now() - lastFrame;
      lastFrame = performance.now();
    }
  };
  $("#change-meditation").addEventListener("click", changeMeditation);
  $("#restart-meditation").addEventListener("click", () => restartMeditation());
  $("#show-tao").addEventListener("click", () => setReflectionMode("tao"));
  new ResizeObserver(resize).observe(surface);
  resize();
  reset();
  requestAnimationFrame(frame);
}

function render() {
  renderHeader();
  renderRuler();
  renderWeek();
  renderReflectionMode();
  renderChapter();
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = `[ ${message} ]`;
  toast.classList.add("show");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove("show"), 1700);
}

function selectModalSignal(signal) {
  const choice = document.querySelector(`input[name="activity-color"][value="${Number(signal) || 0}"]`);
  if (choice) choice.checked = true;
}

function openModal(templateId = null) {
  editingTemplateId = templateId;
  const template = templateId ? findTemplate(templateId) : null;
  $("#modal-kicker").textContent = template ? "EDIT ACTIVITY" : "NEW ACTIVITY";
  $("#modal-heading").textContent = template ? "TUNE ACTIVITY" : "CREATE ACTIVITY";
  $("#activity-submit").textContent = template ? "SAVE CHANGES" : "ADD TO DECK";
  $("#delete-activity").hidden = !template;
  $("#activity-name").value = template?.name || "";
  $("#activity-duration").value = String(template?.duration || 60);
  selectModalSignal(template?.signal ?? themeSignalMemory[currentTheme] ?? 0);
  $("#activity-modal").hidden = false;
  setTimeout(() => $("#activity-name").focus(), 40);
}

function closeModal() {
  $("#activity-modal").hidden = true;
  $("#activity-form").reset();
  editingTemplateId = null;
}

function setupModal() {
  $("#color-options").innerHTML = Array.from({ length: 8 }, (_, index) => `<label class="color-choice"><input type="radio" name="activity-color" value="${index}" ${index === 0 ? "checked" : ""}><span style="--choice:var(--signal-${index})"></span></label>`).join("");
  $("#toggle-activity-edit").addEventListener("click", () => {
    activityEditMode = !activityEditMode;
    const button = $("#toggle-activity-edit");
    button.textContent = activityEditMode ? "DONE" : "EDIT BLOCKS";
    button.setAttribute("aria-pressed", String(activityEditMode));
    document.body.classList.toggle("activity-edit-mode", activityEditMode);
    renderPalette();
    showToast(activityEditMode ? "SELECT A BLOCK TO EDIT" : "BLOCK EDITING DONE");
  });
  $("#open-create").addEventListener("click", () => openModal());
  $("#close-create").addEventListener("click", closeModal);
  $("#activity-modal").addEventListener("click", (event) => { if (event.target === $("#activity-modal")) closeModal(); });
  $("#activity-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = $("#activity-name").value.trim();
    if (!name) return;
    const signal = Number(document.querySelector('input[name="activity-color"]:checked').value);
    const duration = Number($("#activity-duration").value);
    const wasEditing = Boolean(editingTemplateId);
    recordHistory();
    themeSignalMemory[currentTheme] = signal;
    if (editingTemplateId) {
      const template = findTemplate(editingTemplateId);
      if (!template) return closeModal();
      template.name = name;
      template.duration = duration;
      template.signal = signal;
      Object.values(schedule).flat().filter((block) => block.templateId === editingTemplateId).forEach((block) => {
        block.name = name;
        block.signal = signal;
      });
    } else {
      customPalette.push({ id: `custom-${uid()}`, name, duration, signal });
    }
    save();
    renderPalette();
    render();
    closeModal();
    showToast(`${name.toUpperCase()} // ${wasEditing ? "UPDATED" : "ADDED TO DECK"}`);
  });
  $("#delete-activity").addEventListener("click", () => {
    const template = findTemplate(editingTemplateId);
    if (!template) return;
    recordHistory();
    palette = palette.filter((item) => item.id !== editingTemplateId);
    customPalette = customPalette.filter((item) => item.id !== editingTemplateId);
    save();
    renderPalette();
    closeModal();
    showToast(`${template.name.toUpperCase()} // REMOVED FROM DECK`);
  });
}

function applyTheme(theme, persist = false) {
  currentTheme = THEMES.includes(theme) ? theme : "hacker";
  document.body.dataset.theme = currentTheme;
  $$('[data-theme-choice]').forEach((button) => button.classList.toggle("active", button.dataset.themeChoice === currentTheme));
  if (persist) save();
}

function setupThemeSwitcher() {
  $$('[data-theme-choice]').forEach((button) => button.addEventListener("click", () => {
    applyTheme(button.dataset.themeChoice, true);
    showToast(`${button.textContent.trim().toUpperCase()} THEME`);
  }));
}

function updateLockState() {
  document.body.classList.toggle("layout-locked", layoutLocked);
  const button = $("#lock-layout");
  if (button) {
    button.textContent = layoutLocked ? "UNLOCK" : "LOCK";
    button.setAttribute("aria-pressed", String(layoutLocked));
  }
  if ($("#paste-day")) $("#paste-day").disabled = layoutLocked || dayClipboard === null;
  if ($("#clear-day")) $("#clear-day").disabled = layoutLocked;
  if ($("#clear-week")) $("#clear-week").disabled = layoutLocked;
}

function closeDayMenu() {
  $("#day-menu").hidden = true;
  dayMenuDate = null;
}

function openDayMenu(key, anchor) {
  dayMenuDate = key;
  activeDate = key;
  const menu = $("#day-menu");
  const date = dateFromKey(key);
  $("#day-menu-title").textContent = date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }).toUpperCase();
  updateLockState();
  menu.hidden = false;
  const rect = anchor.getBoundingClientRect();
  const width = 218;
  menu.style.left = `${Math.max(12, Math.min(window.innerWidth - width - 12, rect.right + 8))}px`;
  menu.style.top = `${Math.max(12, Math.min(window.innerHeight - 86, rect.top - 4))}px`;
  save();
  renderWeek();
}

function copyDay() {
  if (!dayMenuDate) return;
  dayClipboard = cloneState(schedule[dayMenuDate] || []);
  updateLockState();
  closeDayMenu();
  showToast(`${dayClipboard.length} ACTIVIT${dayClipboard.length === 1 ? "Y" : "IES"} COPIED`);
}

function pasteDay() {
  if (!dayMenuDate || dayClipboard === null || layoutLocked) return showToast("LAYOUT LOCKED");
  recordHistory();
  schedule[dayMenuDate] = dayClipboard.map((block) => {
    const copy = { ...block, instanceId: uid() };
    delete copy.verticalGroupId;
    return copy;
  });
  sortDay(dayMenuDate);
  save();
  render();
  closeDayMenu();
  showToast("DAY PASTED");
}

function clearDay() {
  if (!dayMenuDate || layoutLocked) return showToast("LAYOUT LOCKED");
  const count = (schedule[dayMenuDate] || []).length;
  if (!count) return closeDayMenu();
  const label = dateFromKey(dayMenuDate).toLocaleDateString(undefined, { weekday: "long" });
  if (!window.confirm(`Clear every activity from ${label}?`)) return;
  recordHistory();
  schedule[dayMenuDate] = [];
  save();
  render();
  closeDayMenu();
  showToast(`${label.toUpperCase()} CLEARED`);
}

function clearWeek() {
  if (layoutLocked) return showToast("LAYOUT LOCKED");
  const keys = weekDates().map(dateKey);
  const count = keys.reduce((total, key) => total + (schedule[key] || []).length, 0);
  if (!count) return showToast("WEEK ALREADY CLEAR");
  if (!window.confirm(`Clear all ${count} activities from this week? You can undo this.`)) return;
  recordHistory();
  keys.forEach((key) => { schedule[key] = []; });
  save();
  closeDayMenu();
  render();
  showToast("WEEK CLEARED // UNDO AVAILABLE");
}

function exportPlan() {
  const backup = {
    format: "daylight-os-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    state: cloneState()
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `daylight-plan-${dateKey(new Date())}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("BACKUP SAVED");
}

async function importPlan(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const state = data?.state || data;
    if (!state?.schedule || typeof state.schedule !== "object") throw new Error("Missing schedule");
    recordHistory();
    restoreState(state);
    updateHistoryControls();
    showToast("BACKUP RESTORED");
  } catch {
    showToast("BACKUP NOT RECOGNIZED");
  } finally {
    $("#import-file").value = "";
  }
}

function goToday() {
  weekStart = startOfWeek(new Date());
  activeDate = dateKey(new Date());
  save();
  render();
  requestAnimationFrame(() => $(".day-row.is-today")?.scrollIntoView({ behavior: "smooth", block: "center" }));
  showToast("TODAY IN FOCUS");
}

function setupQualityOfLife() {
  $("#undo-action").addEventListener("click", undo);
  $("#redo-action").addEventListener("click", redo);
  $("#lock-layout").addEventListener("click", () => {
    layoutLocked = !layoutLocked;
    save();
    updateLockState();
    renderPalette();
    renderWeek();
    showToast(layoutLocked ? "LAYOUT LOCKED" : "LAYOUT UNLOCKED");
  });
  $("#export-plan").addEventListener("click", exportPlan);
  $("#import-plan").addEventListener("click", () => $("#import-file").click());
  $("#import-file").addEventListener("change", (event) => importPlan(event.target.files?.[0]));
  $("#copy-day").addEventListener("click", copyDay);
  $("#paste-day").addEventListener("click", pasteDay);
  $("#clear-day").addEventListener("click", clearDay);
  $("#clear-week").addEventListener("click", clearWeek);
  $("#today-button").addEventListener("click", goToday);
  document.addEventListener("click", (event) => {
    if (!event.target.closest("#day-menu") && !event.target.closest("[data-day-actions]")) closeDayMenu();
  });
  updateHistoryControls();
  updateLockState();
}

function setupRemovalZone() {
  const sidebar = $(".palette");
  sidebar.addEventListener("dragover", (event) => {
    if (layoutLocked) return;
    const payload = parseDragPayload(event);
    if (payload?.type !== "block") return;
    event.preventDefault();
    sidebar.classList.add("remove-hover");
    event.dataTransfer.dropEffect = "move";
  });
  sidebar.addEventListener("dragleave", (event) => {
    if (!sidebar.contains(event.relatedTarget)) sidebar.classList.remove("remove-hover");
  });
  sidebar.addEventListener("drop", (event) => {
    if (layoutLocked) return showToast("LAYOUT LOCKED");
    const payload = parseDragPayload(event);
    if (payload?.type !== "block") return;
    event.preventDefault();
    removeBlock(payload.sourceDate, payload.instanceId);
    dragPayload = null;
    clearDropStates(true);
  });
}

function setupControls() {
  $("#previous-week").addEventListener("click", () => {
    weekStart = addDays(weekStart, -7);
    activeDate = dateKey(weekStart);
    save();
    render();
  });
  $("#next-week").addEventListener("click", () => {
    weekStart = addDays(weekStart, 7);
    activeDate = dateKey(weekStart);
    save();
    render();
  });
  $("#date-label").addEventListener("click", () => {
    goToday();
  });
  $("#reset-plan").addEventListener("click", () => {
    if (!window.confirm("Reset all local planner data to the demo schedule?")) return;
    recordHistory();
    palette = DEFAULT_PALETTE.map((item) => ({ ...item }));
    customPalette = [];
    weekStart = startOfWeek(new Date());
    activeDate = dateKey(new Date());
    schedule = createDemoSchedule();
    save();
    renderPalette();
    render();
    showToast("LOCAL DATA RESET");
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModal(); });
}

function setupOcean() {
  const canvas = $("#ocean-canvas");
  const surface = $(".workspace");
  const context = canvas.getContext("2d");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let pointer = .5;
  let width = 0;
  let height = 0;
  let ratio = 1;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    ratio = Math.min(2, window.devicePixelRatio || 1);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  const wave = (time, config) => {
    const amplitude = config.amplitude + oceanLoad * config.loadBoost;
    const baseline = height * config.baseline;
    context.beginPath();
    context.moveTo(0, height);
    context.lineTo(0, baseline);
    for (let x = 0; x <= width + 5; x += 5) {
      const normalized = x / Math.max(1, width);
      const pointerLift = Math.exp(-Math.pow((normalized - pointer) * 4.2, 2)) * 7;
      const y = baseline
        + Math.sin(x * config.frequency + time * config.speed + config.phase) * amplitude
        + Math.sin(x * config.frequency * .43 - time * config.speed * .72) * amplitude * .42
        - pointerLift;
      context.lineTo(x, y);
    }
    context.lineTo(width, height);
    context.closePath();
    const gradient = context.createLinearGradient(0, baseline - amplitude, 0, height);
    gradient.addColorStop(0, config.top);
    gradient.addColorStop(1, config.bottom);
    context.fillStyle = gradient;
    context.fill();
    context.strokeStyle = config.stroke;
    context.lineWidth = 1.2;
    context.shadowColor = config.stroke;
    context.shadowBlur = 8;
    context.stroke();
    context.shadowBlur = 0;
  };

  const signalTerrain = (time) => {
    const layers = [
      { baseline: .52, amplitude: 9, step: 58, speed: .18, top: "rgba(105,70,169,.18)", bottom: "rgba(18,7,31,.05)", stroke: "rgba(142,91,214,.58)" },
      { baseline: .68, amplitude: 13, step: 46, speed: .24, top: "rgba(72,174,91,.19)", bottom: "rgba(8,37,15,.12)", stroke: "rgba(111,232,132,.64)" },
      { baseline: .82, amplitude: 17, step: 37, speed: .31, top: "rgba(117,189,68,.2)", bottom: "rgba(18,43,9,.2)", stroke: "rgba(174,246,101,.72)" }
    ];
    layers.forEach((layer, layerIndex) => {
      const baseline = height * layer.baseline + oceanLoad * (15 + layerIndex * 4);
      context.beginPath();
      context.moveTo(0, height);
      context.lineTo(0, baseline);
      const points = [];
      for (let x = 0; x <= width + layer.step; x += layer.step) {
        const pointerLift = Math.exp(-Math.pow((x / Math.max(1, width) - pointer) * 4.4, 2)) * 7;
        const y = baseline
          + Math.sin(x * (.011 + layerIndex * .0027) + time * layer.speed + layerIndex) * layer.amplitude
          + Math.sin(x * .027 - time * layer.speed * .7) * layer.amplitude * .34
          - pointerLift;
        points.push({ x, y });
        context.lineTo(x, y);
      }
      context.lineTo(width, height);
      context.closePath();
      const gradient = context.createLinearGradient(0, baseline - layer.amplitude, 0, height);
      gradient.addColorStop(0, layer.top);
      gradient.addColorStop(1, layer.bottom);
      context.fillStyle = gradient;
      context.fill();
      context.strokeStyle = layer.stroke;
      context.lineWidth = 1.1;
      context.shadowColor = layer.stroke;
      context.shadowBlur = 6;
      context.stroke();
      context.shadowBlur = 0;

      if (layerIndex > 0) {
        context.strokeStyle = layerIndex === 1 ? "rgba(106,225,127,.14)" : "rgba(165,233,91,.16)";
        context.lineWidth = .7;
        points.forEach((point, index) => {
          if (index % 2 !== 0) return;
          context.beginPath();
          context.moveTo(point.x, point.y);
          context.lineTo(point.x, Math.min(height, point.y + 24 + layerIndex * 9));
          context.stroke();
        });
      }
    });
  };

  const drawHackerRain = (time) => {
    const upper = height * .48;
    const signalDepth = Math.min(upper, Math.max(125, height * .16));
    context.save();
    context.beginPath();
    context.rect(0, 0, width, upper + 20);
    context.clip();

    context.save();
    context.globalCompositeOperation = "screen";
    [
      [.17, .58, 62],
      [.53, .42, 82],
      [.84, .64, 58]
    ].forEach(([position, depth, radius], hub) => {
      const x = width * position + (pointer - .5) * (12 + hub * 4);
      const y = signalDepth * depth;
      const sweep = time * (.055 + hub * .012) + hub * 2.1;
      context.strokeStyle = hub === 1 ? "rgba(151,91,219,.28)" : "rgba(124,255,142,.25)";
      context.lineWidth = .8;
      for (let ring = 1; ring <= 3; ring += 1) {
        context.beginPath();
        context.arc(x, y, radius * ring / 3, 0, Math.PI * 2);
        context.stroke();
      }
      context.strokeStyle = hub === 1 ? "rgba(178,104,234,.48)" : "rgba(172,255,109,.55)";
      context.lineWidth = 1.2;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + Math.cos(sweep) * radius, y + Math.sin(sweep) * radius);
      context.stroke();
      context.fillStyle = hub === 1 ? "rgba(177,96,230,.08)" : "rgba(142,255,112,.075)";
      context.beginPath();
      context.moveTo(x, y);
      context.arc(x, y, radius, sweep - .17, sweep + .17);
      context.closePath();
      context.fill();
    });
    context.restore();

    const nodeCount = Math.max(28, Math.min(42, Math.floor(width / 42)));
    const nodes = Array.from({ length: nodeCount }, (_, index) => {
      const lane = (index * .61803398875 + .071) % 1;
      const tier = (index * .38196601125 + .137) % 1;
      const driftX = Math.sin(time * (.055 + index % 4 * .011) + index * 1.91) * (7 + index % 5 * 2);
      const driftY = Math.cos(time * (.047 + index % 3 * .013) + index * 2.17) * (5 + index % 4 * 1.5);
      return {
        x: width * (.025 + lane * .95) + driftX + (pointer - .5) * (8 + tier * 18),
        y: 14 + tier * (signalDepth - 28) + driftY,
        size: 1.6 + index % 5 * .42,
        accent: index % 9 === 2 || index % 11 === 6
      };
    });

    const links = [];
    for (let index = 0; index < nodes.length; index += 1) {
      const candidates = nodes
        .map((node, target) => ({
          target,
          distance: Math.hypot(node.x - nodes[index].x, node.y - nodes[index].y)
        }))
        .filter(({ target }) => target !== index)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, index % 4 === 0 ? 3 : 2);
      candidates.forEach(({ target, distance }) => {
        const from = Math.min(index, target);
        const to = Math.max(index, target);
        if (distance < width * .22 && !links.some((link) => link.from === from && link.to === to)) {
          links.push({ from, to, distance });
        }
      });
    }

    links.forEach((link, index) => {
      const start = nodes[link.from];
      const end = nodes[link.to];
      const purple = (link.from + link.to) % 7 === 0;
      context.strokeStyle = purple ? "rgba(151,82,209,.38)" : "rgba(105,239,129,.34)";
      context.lineWidth = index % 6 === 0 ? 1.15 : .72;
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();

      if (index % 3 === 0) {
        const phase = (time * (.055 + index % 4 * .018) + index * .23) % 1;
        const packetX = start.x + (end.x - start.x) * phase;
        const packetY = start.y + (end.y - start.y) * phase;
        context.shadowColor = purple ? "rgba(184,99,239,.9)" : "rgba(158,255,105,.94)";
        context.shadowBlur = 8;
        context.fillStyle = purple ? "rgba(212,133,255,.92)" : "rgba(196,255,131,.96)";
        context.beginPath();
        context.arc(packetX, packetY, 1.7, 0, Math.PI * 2);
        context.fill();
      }
    });

    context.shadowBlur = 0;
    nodes.forEach((node, index) => {
      const pulse = .72 + Math.sin(time * .38 + index * 1.7) * .18;
      context.fillStyle = node.accent ? `rgba(181,93,226,${pulse})` : `rgba(119,242,137,${pulse})`;
      context.strokeStyle = node.accent ? "rgba(205,128,248,.58)" : "rgba(178,255,128,.54)";
      context.lineWidth = .8;
      context.beginPath();
      context.arc(node.x, node.y, node.size, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.arc(node.x, node.y, node.size + 3.2, 0, Math.PI * 2);
      context.stroke();

      const ringPhase = (time * .08 + index * .137) % 1;
      if (index % 7 === 1 && ringPhase < .42) {
        context.strokeStyle = node.accent
          ? `rgba(183,91,231,${.3 * (1 - ringPhase / .42)})`
          : `rgba(124,246,137,${.32 * (1 - ringPhase / .42)})`;
        context.beginPath();
        context.arc(node.x, node.y, 6 + ringPhase * 42, 0, Math.PI * 2);
        context.stroke();
      }
    });

    context.globalAlpha = .16;
    context.strokeStyle = "rgba(117,241,136,.46)";
    context.lineWidth = .55;
    for (let y = 18; y < signalDepth + 8; y += 22) {
      context.beginPath();
      context.moveTo(0, y + Math.sin(time * .13 + y) * 1.5);
      context.lineTo(width, y + Math.sin(time * .13 + y) * 1.5);
      context.stroke();
    }
    context.shadowBlur = 0;
    context.restore();
  };

  const drawEarthCanopy = (time) => {
    const upper = height * .48;
    const sway = reducedMotion ? 0 : Math.sin(time * .2) * .035 + (pointer - .5) * .055;
    context.save();
    context.globalAlpha = .94;
    context.beginPath();
    context.rect(0, 0, width, upper + 24);
    context.clip();

    const shadowCrown = (x, y, length, angle, depth, seed) => {
      const nextX = x + Math.cos(angle) * length;
      const nextY = y + Math.sin(angle) * length;
      context.strokeStyle = depth > 2 ? "rgba(24,43,29,.54)" : "rgba(35,62,38,.4)";
      context.lineWidth = Math.max(1, depth * 1.6);
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(nextX, nextY);
      context.stroke();
      if (depth <= 0 || nextY > upper) {
        context.fillStyle = seed % 2 ? "rgba(35,62,38,.46)" : "rgba(67,65,37,.4)";
        for (let leaf = 0; leaf < 5; leaf += 1) {
          const leafAngle = leaf / 5 * Math.PI * 2 + seed;
          context.beginPath();
          context.ellipse(
            nextX + Math.cos(leafAngle) * (5 + seed % 3),
            nextY + Math.sin(leafAngle) * (4 + seed % 2),
            7 + seed % 3,
            2.6 + leaf % 2,
            leafAngle,
            0,
            Math.PI * 2
          );
          context.fill();
        }
        return;
      }
      const drift = Math.sin(time * .11 + seed + depth) * .018 + sway * .45;
      shadowCrown(nextX, nextY, length * .73, angle - .42 + drift, depth - 1, seed + 1);
      shadowCrown(nextX, nextY, length * .73, angle + .42 + drift, depth - 1, seed + 2);
    };

    context.save();
    context.globalAlpha = .72;
    shadowCrown(width * .16, -18, 62, .88, 5, 2);
    shadowCrown(width * .39, -16, 52, 1.18, 4, 5);
    shadowCrown(width * .64, -18, 58, 1.95, 5, 8);
    shadowCrown(width * .88, -14, 64, 2.25, 5, 11);
    context.restore();

    const leafCluster = (x, y, scale, paletteIndex) => {
      const leafColors = ["#315d38", "#4f743c", "#788044", "#8f6535", "#b36b3e"];
      for (let petal = 0; petal < 7; petal += 1) {
        const angle = petal / 7 * Math.PI * 2 + paletteIndex * .4;
        const radius = scale * (.32 + petal % 2 * .15);
        context.fillStyle = leafColors[(petal + paletteIndex) % leafColors.length];
        context.beginPath();
        context.ellipse(
          x + Math.cos(angle) * radius,
          y + Math.sin(angle) * radius,
          scale * .37,
          scale * .22,
          angle,
          0,
          Math.PI * 2
        );
        context.fill();
      }
    };

    const broccoli = (x, y, length, angle, depth, seed) => {
      if (depth <= 0 || y > upper) {
        leafCluster(x, y, Math.max(5, length * .58), seed + depth);
        return;
      }
      const nextX = x + Math.cos(angle) * length;
      const nextY = y + Math.sin(angle) * length;
      context.strokeStyle = depth > 3 ? "rgba(77,49,27,.96)" : "rgba(61,91,45,.92)";
      context.lineWidth = Math.max(.8, depth * 1.05);
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(nextX, nextY);
      context.stroke();
      const flutter = Math.sin(time * .18 + depth + seed) * .025 + sway;
      broccoli(nextX, nextY, length * .71, angle - .48 + flutter, depth - 1, seed + 1);
      broccoli(nextX, nextY, length * .71, angle + .48 + flutter, depth - 1, seed + 3);
      if (depth >= 4) broccoli(nextX, nextY, length * .64, angle + flutter * .5, depth - 1, seed + 5);
    };

    const fern = (originX, length, direction, seed) => {
      context.save();
      context.translate(originX, -6);
      context.rotate(direction * (.06 + sway));
      context.strokeStyle = "rgba(81,111,53,.92)";
      context.lineWidth = 2.2;
      context.beginPath();
      context.moveTo(0, 0);
      context.quadraticCurveTo(direction * length * .08, length * .5, direction * length * .2, length);
      context.stroke();
      for (let leaflet = 1; leaflet <= 12; leaflet += 1) {
        const progress = leaflet / 13;
        const stemX = direction * (length * .08 * progress + length * .12 * progress * progress);
        const stemY = length * progress;
        const leafletSize = 16 * (1 - progress * .64);
        [-1, 1].forEach((side) => {
          context.save();
          context.translate(stemX, stemY);
          context.rotate(side * (.72 - progress * .26) + direction * sway);
          context.fillStyle = (leaflet + seed) % 3 === 0 ? "#987040" : (leaflet + seed) % 2 ? "#3e7248" : "#6e8046";
          context.beginPath();
          context.ellipse(side * leafletSize * .42, 0, leafletSize, leafletSize * .27, 0, 0, Math.PI * 2);
          context.fill();
          context.restore();
        });
      }
      context.restore();
    };

    const hangingMoss = (originX, length, phase, tint) => {
      context.strokeStyle = tint;
      context.lineWidth = 1.15;
      context.beginPath();
      context.moveTo(originX, -2);
      for (let step = 1; step <= 10; step += 1) {
        const progress = step / 10;
        const x = originX + Math.sin(progress * 5.7 + phase + time * .12) * (5 + progress * 9) + sway * progress * 52;
        const y = length * progress;
        context.lineTo(x, y);
      }
      context.stroke();
      for (let bead = 2; bead <= 9; bead += 2) {
        const progress = bead / 10;
        const x = originX + Math.sin(progress * 5.7 + phase + time * .12) * (5 + progress * 9) + sway * progress * 52;
        const y = length * progress;
        context.fillStyle = bead % 4 ? "rgba(95,119,61,.82)" : "rgba(169,112,60,.74)";
        context.beginPath();
        context.ellipse(x + (bead % 3 - 1) * 3, y, 5.4, 2.1, phase + bead, 0, Math.PI * 2);
        context.fill();
      }
    };

    broccoli(width * .035, -8, 64, .68, 5, 1);
    broccoli(width * .965, -8, 64, Math.PI - .68, 5, 4);
    broccoli(width * .31, -14, 49, 1.13 + sway, 4, 7);
    broccoli(width * .54, -12, 52, Math.PI / 2 + sway, 5, 10);
    broccoli(width * .73, -14, 48, 2.04 + sway, 4, 13);
    fern(width * .14, Math.min(upper * .94, 168), 1, 2);
    fern(width * .35, Math.min(upper * .76, 142), -1, 4);
    fern(width * .67, Math.min(upper * .82, 152), 1, 6);
    fern(width * .86, Math.min(upper * .96, 172), -1, 8);
    [
      [.08, .62, .4, "rgba(55,91,51,.78)"],
      [.25, .78, 1.7, "rgba(91,102,53,.74)"],
      [.45, .58, 2.9, "rgba(58,100,57,.75)"],
      [.61, .72, 4.1, "rgba(94,108,58,.7)"],
      [.8, .66, 5.2, "rgba(54,91,49,.76)"],
      [.94, .82, 6.4, "rgba(100,89,47,.7)"]
    ].forEach(([position, scale, phase, tint]) => hangingMoss(width * position, upper * scale, phase, tint));

    context.shadowColor = "rgba(208,173,94,.7)";
    context.shadowBlur = 5;
    for (let spore = 0; spore < 22; spore += 1) {
      const x = width * ((spore * .173 + .041) % 1) + Math.sin(time * .07 + spore * 2.2) * 14;
      const y = 20 + ((spore * 37 + time * (1.1 + spore % 3 * .4)) % Math.max(1, upper - 28));
      const alpha = .22 + (spore % 5) * .08;
      context.fillStyle = spore % 6 === 0 ? `rgba(209,132,68,${alpha})` : `rgba(210,190,113,${alpha})`;
      context.beginPath();
      context.arc(x, y, .7 + spore % 3 * .42, 0, Math.PI * 2);
      context.fill();
    }
    context.shadowBlur = 0;
    context.restore();
  };

  const drawOceanCaustics = (time) => {
    const upper = height * .48;
    const rows = 7;
    const columns = Math.max(10, Math.ceil(width / 86));
    context.save();
    context.beginPath();
    context.rect(0, 0, width, upper + 22);
    context.clip();

    const drawRayShadow = (index) => {
      const travel = (time * (.008 + index * .0025) + index * .53) % 1;
      const direction = index % 2 === 0 ? 1 : -1;
      const x = direction > 0 ? -150 + travel * (width + 300) : width + 150 - travel * (width + 300);
      const y = upper * (.25 + index * .17) + Math.sin(time * .08 + index * 2.3) * 16;
      const scale = .72 + index * .22;
      context.save();
      context.translate(x, y);
      context.scale(direction * scale, scale);
      context.rotate(Math.sin(time * .055 + index) * .08);
      context.fillStyle = index % 2 ? "rgba(13,31,55,.2)" : "rgba(4,28,42,.24)";
      context.beginPath();
      context.moveTo(-62, 0);
      context.quadraticCurveTo(-22, -8, 0, -3);
      context.quadraticCurveTo(35, -32, 82, -22);
      context.quadraticCurveTo(48, -2, 14, 6);
      context.lineTo(-19, 28);
      context.quadraticCurveTo(-7, 7, -62, 0);
      context.closePath();
      context.fill();
      context.strokeStyle = "rgba(74,112,138,.14)";
      context.lineWidth = 1;
      context.stroke();
      context.restore();
    };
    drawRayShadow(0);
    drawRayShadow(1);

    const visibleDepth = Math.min(upper, Math.max(140, height * .18));
    const jellyPalettes = [
      { core: "rgba(205,255,246,.98)", glow: "rgba(64,255,218,.9)", fill: "rgba(74,227,211,.38)" },
      { core: "rgba(239,215,255,.98)", glow: "rgba(202,126,255,.9)", fill: "rgba(153,108,244,.36)" },
      { core: "rgba(216,255,224,.98)", glow: "rgba(113,255,171,.88)", fill: "rgba(77,222,166,.34)" }
    ];
    for (let jelly = 0; jelly < 3; jelly += 1) {
      const palette = jellyPalettes[jelly % jellyPalettes.length];
      const drift = (time * (.006 + jelly * .0014) + jelly * .37) % 1;
      const x = -70 + drift * (width + 140) + Math.sin(time * .075 + jelly) * 12;
      const y = 34 + jelly * 36 + Math.sin(time * .09 + jelly * 1.8) * 8;
      const pulse = 1 + Math.sin(time * .18 + jelly * 1.9) * .07;
      const size = (18 + jelly * 4) * pulse;
      if (y > visibleDepth + 24) continue;
      context.save();
      context.translate(x, y);
      context.globalCompositeOperation = "screen";

      const halo = context.createRadialGradient(0, 2, size * .15, 0, 2, size * 2.3);
      halo.addColorStop(0, palette.glow);
      halo.addColorStop(.24, palette.fill);
      halo.addColorStop(1, "rgba(0,0,0,0)");
      context.globalAlpha = .48;
      context.fillStyle = halo;
      context.beginPath();
      context.ellipse(0, size * .38, size * 2.3, size * 2.7, 0, 0, Math.PI * 2);
      context.fill();

      context.globalAlpha = 1;
      context.shadowColor = palette.glow;
      context.shadowBlur = 24 + jelly * 5;
      context.fillStyle = palette.fill;
      context.strokeStyle = palette.core;
      context.lineWidth = 1.8;
      context.beginPath();
      context.arc(0, 0, size, Math.PI, 0);
      context.quadraticCurveTo(size * .55, size * .38, 0, size * .25);
      context.quadraticCurveTo(-size * .55, size * .38, -size, 0);
      context.closePath();
      context.fill();
      context.stroke();

      context.globalAlpha = .82;
      context.lineWidth = .75;
      for (let vein = -2; vein <= 2; vein += 1) {
        context.beginPath();
        context.moveTo(vein * size * .18, size * .18);
        context.quadraticCurveTo(vein * size * .28, -size * .38, vein * size * .22, -size * .82);
        context.stroke();
      }

      context.globalAlpha = .9;
      context.lineWidth = 1.35;
      for (let tentacle = -2; tentacle <= 2; tentacle += 1) {
        context.beginPath();
        context.moveTo(tentacle * size * .28, size * .2);
        context.bezierCurveTo(
          tentacle * size * .34 + Math.sin(time * .13 + tentacle) * 4,
          size * .72,
          tentacle * size * .2 - Math.cos(time * .1 + jelly) * 5,
          size * 1.12,
          tentacle * size * .25 + Math.sin(time * .11 + jelly + tentacle) * 6,
          size * 1.55
        );
        context.stroke();
      }

      context.shadowBlur = 12;
      for (let spark = 0; spark < 7; spark += 1) {
        const angle = spark / 7 * Math.PI * 2 + time * .035;
        const radius = size * (1.12 + (spark % 3) * .22);
        context.fillStyle = spark % 2 ? palette.core : palette.glow;
        context.beginPath();
        context.arc(Math.cos(angle) * radius, Math.sin(angle) * radius * .72, .7 + spark % 2 * .45, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    }

    context.globalCompositeOperation = "screen";
    context.globalAlpha = .86;

    const surfaceGradient = context.createLinearGradient(0, 0, 0, 46);
    surfaceGradient.addColorStop(0, "rgba(190,255,246,.44)");
    surfaceGradient.addColorStop(1, "rgba(64,169,205,0)");
    context.fillStyle = surfaceGradient;
    context.beginPath();
    context.moveTo(0, 0);
    for (let x = 0; x <= width + 8; x += 8) {
      const y = 14 + Math.sin(x * .021 + time * .28) * 7 + Math.sin(x * .047 - time * .21) * 3;
      context.lineTo(x, y);
    }
    context.lineTo(width, 0);
    context.closePath();
    context.fill();

    for (let ripple = 0; ripple < 3; ripple += 1) {
      context.strokeStyle = ripple === 1 ? "rgba(197,177,247,.34)" : `rgba(166,255,244,${.47 - ripple * .085})`;
      context.lineWidth = 1.05 + ripple * .35;
      context.beginPath();
      for (let x = 0; x <= width + 8; x += 8) {
        const y = 9 + ripple * 12
          + Math.sin(x * (.018 + ripple * .003) + time * (.24 - ripple * .035) + ripple) * (5 + ripple * 2)
          + Math.sin(x * .043 - time * .17) * 2.5;
        if (x === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    }

    for (let index = 0; index < 5; index += 1) {
      const beamX = width * (.04 + index * .235) + Math.sin(time * .13 + index * 1.4) * 24 + (pointer - .5) * 30;
      const beam = context.createLinearGradient(beamX, 0, beamX + 90, upper);
      beam.addColorStop(0, index % 2 ? "rgba(181,168,247,.22)" : "rgba(157,244,237,.28)");
      beam.addColorStop(1, "rgba(73,145,196,0)");
      context.fillStyle = beam;
      context.beginPath();
      context.moveTo(beamX - 20, 0);
      context.lineTo(beamX + 24, 0);
      context.lineTo(beamX + 142, upper);
      context.lineTo(beamX + 55, upper);
      context.closePath();
      context.fill();
    }

    const meshPoint = (column, row, layer = 0) => {
      const xStep = width / Math.max(1, columns - 1);
      const yStep = upper / Math.max(1, rows - 1);
      const baseX = column * xStep;
      const baseY = 20 + row * yStep + layer * 8;
      const depth = 1 + row * .16;
      const pointerDistance = (baseX - pointer * width) / Math.max(1, width * .2);
      const pointerRipple = Math.exp(-pointerDistance * pointerDistance) * Math.sin(time * .52 + row * 1.35) * 7;
      return {
        x: baseX + Math.sin(row * (1.9 + layer * .17) + column * .77 + time * (.22 - layer * .055)) * (16 + layer * 7) * depth + (pointer - .5) * row * 2.4,
        y: baseY + Math.cos(column * (1.27 - layer * .11) - row * .81 + time * (.18 + layer * .04)) * (8 + layer * 3) * depth + pointerRipple
      };
    };

    const drawMesh = (layer) => {
      context.lineWidth = layer === 0 ? 1.2 : .72;
      context.shadowColor = layer === 0 ? "rgba(126,236,234,.48)" : "rgba(164,145,224,.3)";
      context.shadowBlur = layer === 0 ? 5 : 2;
      for (let row = 0; row < rows; row += 1) {
        context.beginPath();
        for (let column = 0; column < columns; column += 1) {
          const point = meshPoint(column, row, layer);
          if (column === 0) context.moveTo(point.x, point.y);
          else context.lineTo(point.x, point.y);
        }
        context.strokeStyle = layer === 0
          ? row % 3 === 1 ? "rgba(172,157,239,.31)" : "rgba(136,236,229,.42)"
          : row % 2 ? "rgba(121,143,224,.19)" : "rgba(98,198,209,.2)";
        context.stroke();
      }
      for (let column = 0; column < columns; column += 1) {
        context.beginPath();
        for (let row = 0; row < rows; row += 1) {
          const point = meshPoint(column, row, layer);
          if (row === 0) context.moveTo(point.x, point.y);
          else context.lineTo(point.x, point.y);
        }
        context.strokeStyle = layer === 0
          ? column % 4 === 2 ? "rgba(176,155,239,.24)" : "rgba(116,221,225,.3)"
          : column % 3 ? "rgba(115,175,217,.15)" : "rgba(184,152,229,.17)";
        context.stroke();
      }
    };
    drawMesh(1);
    drawMesh(0);

    context.shadowBlur = 0;
    for (let mote = 0; mote < 30; mote += 1) {
      const current = time * (.004 + mote % 5 * .0012) + mote * .071;
      const x = width * (current % 1) + Math.sin(time * .12 + mote) * 9;
      const y = 24 + ((mote * 29.7 + Math.sin(time * .1 + mote * 1.8) * 13) % Math.max(1, upper - 32));
      const glow = .24 + mote % 6 * .08;
      context.shadowColor = mote % 7 === 0 ? "rgba(197,147,240,.8)" : "rgba(107,242,220,.8)";
      context.shadowBlur = 5 + mote % 3 * 2;
      context.fillStyle = mote % 7 === 0 ? `rgba(209,164,247,${glow})` : `rgba(135,249,225,${glow})`;
      context.beginPath();
      context.arc(x, y, .65 + mote % 4 * .35, 0, Math.PI * 2);
      context.fill();
    }
    context.shadowBlur = 0;
    for (let bubble = 0; bubble < 13; bubble += 1) {
      const x = width * ((bubble * .137 + .07) % 1) + Math.sin(time * .09 + bubble) * 12;
      const travel = (time * (4 + bubble % 4) + bubble * 31) % (upper + 32);
      const y = upper + 16 - travel;
      const radius = 1.8 + bubble % 4 * .9;
      context.strokeStyle = bubble % 5 === 0 ? "rgba(193,174,247,.72)" : "rgba(179,246,239,.7)";
      context.lineWidth = 1;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();
  };

  const drawDreamMirage = (time) => {
    const upper = height * .48;
    const visibleDepth = Math.min(upper, Math.max(138, height * .18));
    const strokes = [
      "rgba(255,98,174,.62)",
      "rgba(164,116,255,.58)",
      "rgba(104,236,204,.58)",
      "rgba(207,235,88,.48)",
      "rgba(255,157,92,.48)"
    ];
    const fills = [
      "rgba(255,87,166,.085)",
      "rgba(150,102,244,.08)",
      "rgba(89,225,194,.075)",
      "rgba(201,229,77,.065)",
      "rgba(246,137,78,.06)"
    ];
    context.save();
    context.beginPath();
    context.rect(0, 0, width, upper + 20);
    context.clip();
    context.globalCompositeOperation = "screen";
    context.lineCap = "round";
    context.lineJoin = "round";

    for (let ribbon = 0; ribbon < 7; ribbon += 1) {
      const y = 18 + ribbon * (visibleDepth / 8);
      const bend = Math.sin(time * .09 + ribbon * 1.27) * 24;
      context.strokeStyle = strokes[ribbon % strokes.length];
      context.globalAlpha = .18 + ribbon % 3 * .055;
      context.lineWidth = 1 + ribbon % 3 * .5;
      context.shadowColor = strokes[ribbon % strokes.length];
      context.shadowBlur = 5;
      context.beginPath();
      context.moveTo(-35, y + bend * .15);
      context.bezierCurveTo(width * .24, y - 42 - bend, width * .41, y + 46 + bend, width * .58, y + Math.sin(time * .12 + ribbon) * 13);
      context.bezierCurveTo(width * .73, y - 38 + bend, width * .88, y + 36 - bend, width + 35, y - bend * .2);
      context.stroke();
    }

    context.globalAlpha = 1;
    for (let blob = 0; blob < 8; blob += 1) {
      const lane = (blob * .61803398875 + .09) % 1;
      const tier = (blob * .38196601125 + .12) % 1;
      const cx = width * (.04 + lane * .92) + Math.sin(time * .06 + blob * 1.8) * 13;
      const cy = 22 + tier * (visibleDepth - 44) + Math.cos(time * .075 + blob * 1.3) * 7;
      const baseRadius = 28 + blob % 4 * 9;
      context.save();
      context.translate(cx, cy);
      context.rotate(time * (blob % 2 ? -.018 : .014) + blob * .73);
      context.fillStyle = fills[blob % fills.length];
      context.strokeStyle = strokes[blob % strokes.length];
      context.lineWidth = 1.25 + blob % 3 * .35;
      context.shadowColor = strokes[blob % strokes.length];
      context.shadowBlur = 8;
      context.beginPath();
      for (let point = 0; point <= 56; point += 1) {
        const angle = point / 56 * Math.PI * 2;
        const radius = baseRadius * (1 + Math.sin(angle * (3 + blob % 3) + time * .1 + blob) * .2 + Math.sin(angle * 2 - time * .07) * .08);
        const x = Math.cos(angle) * radius * (1.1 + blob % 2 * .18);
        const y = Math.sin(angle) * radius * .58;
        if (point === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.closePath();
      context.fill();
      context.stroke();
      context.globalAlpha = .48;
      context.beginPath();
      context.ellipse(baseRadius * .18, 0, baseRadius * .42, baseRadius * .18, .4, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }

    context.shadowBlur = 6;
    for (let rosette = 0; rosette < 3; rosette += 1) {
      const cx = width * (.2 + rosette * .31) + (pointer - .5) * (9 + rosette * 4);
      const cy = 34 + rosette % 2 * 54;
      for (let petal = 0; petal < 8; petal += 1) {
        const angle = petal / 8 * Math.PI * 2 + time * (rosette % 2 ? -.025 : .021);
        context.save();
        context.translate(cx, cy);
        context.rotate(angle);
        context.fillStyle = fills[(petal + rosette) % fills.length];
        context.strokeStyle = strokes[(petal + rosette) % strokes.length];
        context.globalAlpha = .6;
        context.beginPath();
        context.ellipse(17 + rosette * 2, 0, 15, 4.5, 0, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        context.restore();
      }
    }
    context.restore();
  };

  const drawVelvetGlass = (time) => {
    const upper = height * .48;
    const visibleDepth = Math.min(upper, Math.max(140, height * .18));
    const glass = [
      "rgba(154,57,84,.2)",
      "rgba(191,133,63,.19)",
      "rgba(70,112,96,.18)",
      "rgba(88,67,122,.19)",
      "rgba(56,85,120,.17)"
    ];
    context.save();
    context.beginPath();
    context.rect(0, 0, width, upper + 20);
    context.clip();

    for (let beamIndex = 0; beamIndex < 5; beamIndex += 1) {
      const origin = width * (.08 + beamIndex * .22) + Math.sin(time * .035 + beamIndex) * 12;
      const beam = context.createLinearGradient(origin, 0, origin + 95, visibleDepth);
      beam.addColorStop(0, beamIndex % 2 ? "rgba(213,164,94,.16)" : "rgba(157,74,100,.13)");
      beam.addColorStop(1, "rgba(98,62,49,0)");
      context.fillStyle = beam;
      context.beginPath();
      context.moveTo(origin - 18, 0);
      context.lineTo(origin + 26, 0);
      context.lineTo(origin + 132, visibleDepth);
      context.lineTo(origin + 64, visibleDepth);
      context.closePath();
      context.fill();
    }

    const paneCount = Math.max(7, Math.ceil(width / 175));
    const paneWidth = width / paneCount;
    context.globalCompositeOperation = "screen";
    for (let pane = 0; pane < paneCount; pane += 1) {
      const left = pane * paneWidth;
      const right = left + paneWidth;
      const crown = 23 + pane % 3 * 8 + Math.sin(time * .045 + pane) * 3;
      const split = .34 + pane % 4 * .1;
      const midX = left + paneWidth * split;
      const midY = crown + visibleDepth * (.36 + pane % 2 * .12);
      context.fillStyle = glass[pane % glass.length];
      context.beginPath();
      context.moveTo(left, crown);
      context.lineTo(right, crown + pane % 2 * 7);
      context.lineTo(midX, midY);
      context.closePath();
      context.fill();
      context.fillStyle = glass[(pane + 2) % glass.length];
      context.beginPath();
      context.moveTo(right, crown + pane % 2 * 7);
      context.lineTo(right, visibleDepth);
      context.lineTo(midX, midY);
      context.closePath();
      context.fill();
      context.fillStyle = glass[(pane + 4) % glass.length];
      context.beginPath();
      context.moveTo(left, crown);
      context.lineTo(midX, midY);
      context.lineTo(left, visibleDepth);
      context.closePath();
      context.fill();
    }

    context.globalCompositeOperation = "source-over";
    context.strokeStyle = "rgba(86,56,39,.78)";
    context.lineWidth = 3.2;
    for (let pane = 0; pane <= paneCount; pane += 1) {
      const x = pane * paneWidth + Math.sin(time * .025 + pane) * 1.5;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, visibleDepth);
      context.stroke();
    }
    context.strokeStyle = "rgba(196,151,88,.42)";
    context.lineWidth = .85;
    for (let pane = 0; pane < paneCount; pane += 1) {
      const left = pane * paneWidth;
      const right = left + paneWidth;
      const crown = 23 + pane % 3 * 8 + Math.sin(time * .045 + pane) * 3;
      const midX = left + paneWidth * (.34 + pane % 4 * .1);
      const midY = crown + visibleDepth * (.36 + pane % 2 * .12);
      context.beginPath();
      context.moveTo(left, crown);
      context.lineTo(right, crown + pane % 2 * 7);
      context.lineTo(midX, midY);
      context.lineTo(left, crown);
      context.moveTo(midX, midY);
      context.lineTo(left, visibleDepth);
      context.moveTo(midX, midY);
      context.lineTo(right, visibleDepth);
      context.stroke();
    }

    context.globalCompositeOperation = "screen";
    context.shadowColor = "rgba(224,177,105,.7)";
    context.shadowBlur = 6;
    for (let mote = 0; mote < 34; mote += 1) {
      const x = width * ((mote * .173 + .027) % 1) + Math.sin(time * .055 + mote) * 11 + (pointer - .5) * (mote % 4 * 2);
      const travel = (mote * 31 + time * (.7 + mote % 4 * .22)) % visibleDepth;
      const y = visibleDepth - travel;
      context.fillStyle = mote % 7 === 0 ? "rgba(181,88,112,.46)" : `rgba(224,182,113,${.2 + mote % 5 * .07})`;
      context.beginPath();
      context.arc(x, y, .65 + mote % 3 * .35, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  };

  const draw = (timestamp = 0) => {
    const time = timestamp / 1000;
    context.clearRect(0, 0, width, height);
    const theme = document.body.dataset.theme || "hacker";
    const waveThemes = {
      hacker: {
        sky: ["rgba(3,10,5,.18)", "rgba(0,2,1,.98)"],
        waves: [
          ["rgba(145,113,232,.27)", "rgba(55,34,113,.08)", "rgba(145,113,232,.65)"],
          ["rgba(54,203,232,.28)", "rgba(14,67,105,.13)", "rgba(54,203,232,.72)"],
          ["rgba(45,182,171,.35)", "rgba(5,43,66,.25)", "rgba(71,217,154,.76)"]
        ]
      },
      earth: {
        sky: ["rgba(34,25,16,.34)", "rgba(8,19,13,1)"],
        waves: [
          ["rgba(48,32,24,.74)", "rgba(20,14,10,.5)", "rgba(101,63,40,.96)"],
          ["rgba(103,42,25,.76)", "rgba(46,24,17,.56)", "rgba(177,87,50,.98)"],
          ["rgba(27,62,39,.82)", "rgba(10,31,19,.66)", "rgba(72,124,78,.98)"]
        ]
      },
      ocean: {
        sky: ["rgba(3,24,42,.18)", "rgba(1,8,18,.98)"],
        waves: [
          ["rgba(121,107,208,.3)", "rgba(38,30,102,.09)", "rgba(141,125,227,.72)"],
          ["rgba(47,168,196,.34)", "rgba(8,67,100,.15)", "rgba(77,201,215,.8)"],
          ["rgba(38,153,149,.44)", "rgba(3,48,67,.3)", "rgba(99,214,173,.84)"]
        ]
      },
      dream: {
        sky: ["rgba(48,10,61,.27)", "rgba(12,3,23,.98)"],
        waves: [
          ["rgba(148,91,232,.36)", "rgba(62,20,98,.12)", "rgba(185,119,247,.78)"],
          ["rgba(231,67,139,.38)", "rgba(105,17,75,.18)", "rgba(255,102,168,.84)"],
          ["rgba(66,190,169,.43)", "rgba(15,72,67,.27)", "rgba(166,224,91,.86)"]
        ]
      },
      velvet: {
        sky: ["rgba(55,24,34,.3)", "rgba(12,6,10,.98)"],
        waves: [
          ["rgba(100,54,82,.4)", "rgba(43,19,35,.2)", "rgba(132,82,116,.72)"],
          ["rgba(135,58,72,.38)", "rgba(66,24,34,.24)", "rgba(174,80,90,.76)"],
          ["rgba(125,93,50,.46)", "rgba(55,36,22,.32)", "rgba(198,151,79,.82)"]
        ]
      }
    };
    const colors = waveThemes[theme];
    const sky = context.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, colors.sky[0]);
    sky.addColorStop(1, colors.sky[1]);
    context.fillStyle = sky;
    context.fillRect(0, 0, width, height);

    if (theme === "hacker") drawHackerRain(time);
    if (theme === "earth") drawEarthCanopy(time);
    if (theme === "ocean") drawOceanCaustics(time);
    if (theme === "dream") drawDreamMirage(time);
    if (theme === "velvet") drawVelvetGlass(time);

    if (theme === "hacker") {
      signalTerrain(time);
    } else {
      wave(time, { amplitude: 7, loadBoost: 16, baseline: .48, frequency: .012, speed: .65, phase: 2.4, top: colors.waves[0][0], bottom: colors.waves[0][1], stroke: colors.waves[0][2] });
      wave(time, { amplitude: 9, loadBoost: 19, baseline: .63, frequency: .015, speed: .82, phase: .9, top: colors.waves[1][0], bottom: colors.waves[1][1], stroke: colors.waves[1][2] });
      wave(time, { amplitude: 11, loadBoost: 22, baseline: .79, frequency: .019, speed: 1.04, phase: 4.1, top: colors.waves[2][0], bottom: colors.waves[2][1], stroke: colors.waves[2][2] });
    }

    if (!reducedMotion) requestAnimationFrame(draw);
  };

  surface.addEventListener("pointermove", (event) => {
    const rect = surface.getBoundingClientRect();
    pointer = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  });
  surface.addEventListener("pointerleave", () => { pointer = .5; });
  new ResizeObserver(() => { resize(); if (reducedMotion) draw(0); }).observe(canvas);
  resize();
  requestAnimationFrame(draw);
}

async function startApplication() {
  await load();
  applyTheme(currentTheme);
  renderPalette();
  setupModal();
  setupThemeSwitcher();
  setupRemovalZone();
  setupControls();
  setupQualityOfLife();
  setupChapterCard();
  setupMeditation();
  render();
  setupOcean();
  setInterval(() => { renderRuler(); renderWeek(); renderChapter(); }, 60_000);
}

startApplication();
