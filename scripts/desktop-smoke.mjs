import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const CDP_ENDPOINT = process.env.WEEK_RHYTHM_CDP || "http://127.0.0.1:9223";
const MODE = process.env.WEEK_RHYTHM_TEST_MODE || "exercise";
const STORAGE_KEY = "daylight-os-planner-v4";
const DAY_START = 6 * 60;
const DAY_END = DAY_START + 24 * 60;
const RESULTS_DIR = resolve("test-results");
const BASELINE_FILE = resolve(RESULTS_DIR, "desktop-baseline.json");
const MARKER_FILE = resolve(RESULTS_DIR, "desktop-marker.json");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function scheduledCount(state) {
  return Object.values(state?.schedule || {}).reduce(
    (total, blocks) => total + (Array.isArray(blocks) ? blocks.length : 0),
    0,
  );
}

function bestDrop(state, duration) {
  let best = null;
  for (const [date, blocks] of Object.entries(state.schedule || {})) {
    const sorted = [...(blocks || [])].sort((a, b) => a.start - b.start);
    let cursor = DAY_START;
    for (const block of [...sorted, { start: DAY_END, duration: 0 }]) {
      const available = block.start - cursor;
      if (available >= duration + 60 && (!best || available > best.available)) {
        best = { date, start: cursor + 30, available };
      }
      cursor = Math.max(cursor, block.start + block.duration);
    }
  }
  return best;
}

async function waitForSavedState(page, predicate, label) {
  const deadline = Date.now() + 6_000;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => window.weekRhythmDesktop.load());
    if (state && predicate(state)) return state;
    await page.waitForTimeout(100);
  }
  throw new Error(`Timed out waiting for SQLite persistence: ${label}`);
}

const browser = await chromium.connectOverCDP(CDP_ENDPOINT);
const pages = browser.contexts().flatMap((context) => context.pages());
const page = pages.find((candidate) => candidate.url().includes("localhost:1420")) || pages[0];
assert(page, "The Week Rhythm WebView2 page was not found.");

await page.waitForSelector(".activity-card");
await page.waitForSelector(".day-track");
await page.waitForTimeout(500);

const desktopAvailable = await page.evaluate(() => window.weekRhythmDesktop?.available === true);
assert(desktopAvailable, "The native SQLite bridge is not active.");

if (MODE === "inspect") {
  const state = await page.evaluate(() => window.weekRhythmDesktop.load());
  console.log(JSON.stringify({
    nativeBridge: true,
    theme: state?.currentTheme,
    blocks: scheduledCount(state),
    activeDate: state?.activeDate,
    activities: state?.palette?.map((activity) => activity.name),
  }, null, 2));
  await browser.close();
} else if (MODE === "clear-week") {
  const baseline = await page.evaluate(() => window.weekRhythmDesktop.load());
  const baselineLocalStorage = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);

  try {
    let displayedDates = await page.locator("[data-track-date]").evaluateAll((tracks) => tracks.map((track) => track.dataset.trackDate));
    let displayedCount = displayedDates.reduce((total, key) => total + (baseline.schedule[key] || []).length, 0);
    let preClearState = baseline;
    if (!displayedCount) {
      const populatedDate = Object.entries(baseline.schedule).find(([, blocks]) => blocks.length)?.[0];
      if (populatedDate) {
        const displayedStart = new Date(`${displayedDates[0]}T12:00:00`);
        const targetDate = new Date(`${populatedDate}T12:00:00`);
        const weekSteps = Math.round((targetDate - displayedStart) / (7 * 24 * 60 * 60 * 1000));
        const navigation = page.locator(weekSteps < 0 ? "#previous-week" : "#next-week");
        for (let index = 0; index < Math.abs(weekSteps); index += 1) await navigation.click();
        displayedDates = await page.locator("[data-track-date]").evaluateAll((tracks) => tracks.map((track) => track.dataset.trackDate));
        displayedCount = displayedDates.reduce((total, key) => total + (baseline.schedule[key] || []).length, 0);
      } else {
        await page.locator(".activity-card").first().dblclick();
        preClearState = await waitForSavedState(
          page,
          (state) => displayedDates.some((key) => (state.schedule[key] || []).length > 0),
          "temporary activity",
        );
        displayedCount = displayedDates.reduce((total, key) => total + (preClearState.schedule[key] || []).length, 0);
      }
    }
    assert(displayedCount > 0, "The populated week could not be displayed for Clear Week testing.");
    assert(!(await page.locator("#clear-week").isDisabled()), "Clear Week is unexpectedly disabled.");
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#clear-week").click();
    await waitForSavedState(
      page,
      (state) => displayedDates.every((key) => (state.schedule[key] || []).length === 0),
      "clear week",
    );
    assert(!(await page.locator("#undo-action").isDisabled()), "Undo was not enabled after clearing the week.");
    await page.locator("#undo-action").click();
    await waitForSavedState(
      page,
      (state) => JSON.stringify(state.schedule) === JSON.stringify(preClearState.schedule),
      "undo clear week",
    );
    console.log(JSON.stringify({
      nativeBridge: true,
      clearedActivities: displayedCount,
      undoEnabled: true,
      exactScheduleRestored: true,
    }, null, 2));
  } finally {
    await page.evaluate(async ({ state, localValue, key }) => {
      await window.weekRhythmDesktop.save(state);
      if (localValue === null) localStorage.removeItem(key);
      else localStorage.setItem(key, localValue);
    }, { state: baseline, localValue: baselineLocalStorage, key: STORAGE_KEY });
    await browser.close();
  }
} else if (MODE === "verify" || MODE === "restore") {
  const baseline = JSON.parse(await readFile(BASELINE_FILE, "utf8"));
  if (MODE === "verify") {
    const marker = JSON.parse(await readFile(MARKER_FILE, "utf8"));
    const reloadedState = await page.evaluate(() => window.weekRhythmDesktop.load());
    const persistedBlock = Object.values(reloadedState.schedule)
      .flatMap((blocks) => blocks)
      .find((block) => block.instanceId === marker.addedInstanceId);
    assert(persistedBlock, "The dragged activity did not survive a native app restart.");
    assert(persistedBlock.duration === marker.resizedToMinutes, "The resized duration did not survive restart.");
    assert(reloadedState.currentTheme === "ocean", "The selected theme did not survive restart.");
    assert(scheduledCount(reloadedState) === marker.persistedCount, "The saved block count changed after restart.");
  }

  await page.evaluate(async ({ state, localValue, key }) => {
    await window.weekRhythmDesktop.save(state);
    if (localValue === null) localStorage.removeItem(key);
    else localStorage.setItem(key, localValue);
  }, { state: baseline.state, localValue: baseline.localStorage, key: STORAGE_KEY });

  const restored = await page.evaluate(() => window.weekRhythmDesktop.load());
  assert(JSON.stringify(restored) === JSON.stringify(baseline.state), "The pre-test planner state was not restored.");
  console.log(JSON.stringify({
    nativeBridge: true,
    persistedAfterRestart: MODE === "verify",
    originalStateRestored: true,
    restoredBlocks: scheduledCount(restored),
  }, null, 2));
  await browser.close();
} else {
  const originalState = await page.evaluate(() => window.weekRhythmDesktop.load());
  const originalLocalStorage = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  assert(originalState?.schedule && originalState?.palette, "No native planner state was available.");
  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(BASELINE_FILE, JSON.stringify({ state: originalState, localStorage: originalLocalStorage }, null, 2));

  const initialCount = scheduledCount(originalState);
  const template = originalState.palette.find((item) => item.id !== "sleep") || originalState.palette[0];
  const drop = bestDrop(originalState, template.duration);
  assert(template && drop, "Could not locate an open interval for the drag test.");

  const source = page.locator(`.activity-card[data-template-id="${template.id}"]`);
  const target = page.locator(`[data-track-date="${drop.date}"]`);
  const targetBox = await target.boundingBox();
  assert(targetBox, "The destination day lane is not visible.");

  await source.dragTo(target, {
    targetPosition: {
      x: ((drop.start - DAY_START) / (DAY_END - DAY_START)) * targetBox.width,
      y: targetBox.height / 2,
    },
  });

  const afterDrag = await waitForSavedState(
    page,
    (state) => scheduledCount(state) === initialCount + 1,
    "activity drag",
  );
  const originalIds = new Set(
    Object.values(originalState.schedule).flatMap((blocks) => blocks.map((block) => block.instanceId)),
  );
  const added = Object.values(afterDrag.schedule)
    .flatMap((blocks) => blocks)
    .find((block) => !originalIds.has(block.instanceId));
  assert(added, "The dragged activity was not found in saved state.");

  const addedElement = page.locator(`[data-instance-id="${added.instanceId}"]`);
  const rightHandle = addedElement.locator(".resize-handle.right");
  const handleBox = await rightHandle.boundingBox();
  assert(handleBox, "The resize handle is not visible.");
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 28, handleBox.y + handleBox.height / 2, { steps: 8 });
  await page.mouse.up();

  const afterResize = await waitForSavedState(
    page,
    (state) => Object.values(state.schedule)
      .flatMap((blocks) => blocks)
      .some((block) => block.instanceId === added.instanceId && block.duration > added.duration),
    "activity resize",
  );

  await page.locator('[data-theme-choice="ocean"]').click();
  await page.waitForFunction(() => document.body.dataset.theme === "ocean");
  const savedOcean = await waitForSavedState(page, (state) => state.currentTheme === "ocean", "theme change");
  const resized = Object.values(afterResize.schedule)
    .flatMap((blocks) => blocks)
    .find((block) => block.instanceId === added.instanceId);

  const marker = {
    addedInstanceId: added.instanceId,
    initialCount,
    persistedCount: scheduledCount(savedOcean),
    resizedFromMinutes: added.duration,
    resizedToMinutes: resized.duration,
  };
  await writeFile(MARKER_FILE, JSON.stringify(marker, null, 2));
  await page.screenshot({ path: resolve(RESULTS_DIR, "desktop-smoke.png"), fullPage: true });
  console.log(JSON.stringify({
    nativeBridge: true,
    initialBlocks: initialCount,
    blocksAfterDrag: marker.persistedCount,
    resizedFromMinutes: marker.resizedFromMinutes,
    resizedToMinutes: marker.resizedToMinutes,
    themeSaved: savedOcean.currentTheme,
    screenshot: resolve(RESULTS_DIR, "desktop-smoke.png"),
  }, null, 2));
  await browser.close();
}
