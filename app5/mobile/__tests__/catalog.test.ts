import fs from "fs";
import path from "path";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadBundledContent } from "../src/content";
import {
  bodyParts,
  getBodySelection,
  getCombinations,
  resolveSelection,
} from "../src/content/catalog";
import {
  readLastStarted,
  rememberStarted,
  setSelection,
} from "../src/storage/selection";

describe("composable library", () => {
  it("loads all 36 folders with unique, timed prompts", () => {
    const pack = loadBundledContent();
    expect(pack.exercises).toHaveLength(36);
    const ids = new Set<string>();
    for (const ex of pack.exercises) {
      expect(ex.duration_seconds).toBe(30);
      const folder = path.join(
        __dirname,
        "../assets/exercises",
        ex.library!.body_part,
        ex.library!.muscle,
        ex.id,
      );
      expect(
        JSON.parse(fs.readFileSync(path.join(folder, "exercise.json"), "utf8"))
          .id,
      ).toBe(ex.id);
      for (const c of ex.voice_cues) {
        expect(ids.has(c.id)).toBe(false);
        ids.add(c.id);
        expect(c.audio_path).toMatch(/^audio\/.+\.mp3$/);
        expect(c.at_seconds + c.max_duration_seconds).toBeLessThanOrEqual(30);
      }
      expect(
        ex.source_ids.every((id) => pack.sources.some((s) => s.id === id)),
      ).toBe(true);
    }
  });
  it("reuses atomic movements without position changes within curated combinations", () => {
    const combos = getCombinations();
    for (const combo of combos) {
      const units = resolveSelection(combo);
      expect(units).toHaveLength(combo.exerciseIds.length);
      expect(new Set(units.map((e) => e.position)).size).toBe(1);
      expect(new Set(units.map((e) => e.id)).size).toBe(units.length);
    }
    const all = combos.flatMap((c) => c.exerciseIds);
    expect(new Set(all).size).toBeLessThan(all.length);
  });
  it("makes every part reachable and groups posture transitions", () => {
    for (const part of bodyParts) {
      const units = resolveSelection(getBodySelection(part.name));
      expect(units.length).toBeGreaterThan(0);
      const positions = units.map((e) =>
        ["sitting", "standing", "lying"].indexOf(e.position),
      );
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    }
  });
});

describe("last started combination", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });
  it("keeps the last actual start when merely previewing another selection", async () => {
    const [first, second] = getCombinations();
    expect(await readLastStarted()).toBeNull();
    await rememberStarted(first);
    setSelection(second);
    expect((await readLastStarted())?.exerciseIds).toEqual(first.exerciseIds);
  });
  it("restores persisted data and handles missing exercises and corrupt data", async () => {
    const selection = getCombinations()[0];
    await AsyncStorage.setItem(
      "stretch/last-started/v2",
      JSON.stringify(selection),
    );
    expect((await readLastStarted())?.id).toBe(selection.id);
    await AsyncStorage.setItem(
      "stretch/last-started/v2",
      JSON.stringify({ ...selection, exerciseIds: ["removed"] }),
    );
    expect(await readLastStarted()).toBeNull();
    await AsyncStorage.setItem("stretch/last-started/v2", "bad json");
    expect(await readLastStarted()).toBeNull();
  });
});
