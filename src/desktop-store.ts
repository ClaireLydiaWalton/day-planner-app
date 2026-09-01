import Database from "@tauri-apps/plugin-sql";

type PlannerState = Record<string, unknown>;

interface DesktopStore {
  available: boolean;
  load: () => Promise<PlannerState | null>;
  save: (state: PlannerState) => Promise<void>;
}

declare global {
  interface Window {
    weekRhythmDesktop?: DesktopStore;
  }
}

const isDesktop = "__TAURI_INTERNALS__" in window;
let databasePromise: Promise<Database> | null = null;
let saveQueue: Promise<void> = Promise.resolve();

async function database(): Promise<Database> {
  if (!databasePromise) {
    databasePromise = Database.load("sqlite:week-rhythm.db").then(async (connection) => {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS planner_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          state_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      return connection;
    });
  }
  return databasePromise;
}

window.weekRhythmDesktop = {
  available: isDesktop,
  async load() {
    if (!isDesktop) return null;
    const connection = await database();
    const rows = await connection.select<Array<{ state_json: string }>>(
      "SELECT state_json FROM planner_state WHERE id = 1 LIMIT 1",
    );
    if (!rows.length) return null;
    return JSON.parse(rows[0].state_json) as PlannerState;
  },
  async save(state) {
    if (!isDesktop) return;
    const stateJson = JSON.stringify(state);
    saveQueue = saveQueue.then(async () => {
      const connection = await database();
      await connection.execute(
        `INSERT INTO planner_state (id, state_json, updated_at)
         VALUES (1, $1, $2)
         ON CONFLICT(id) DO UPDATE SET
           state_json = excluded.state_json,
           updated_at = excluded.updated_at`,
        [stateJson, new Date().toISOString()],
      );
    });
    return saveQueue;
  },
};

export {};
