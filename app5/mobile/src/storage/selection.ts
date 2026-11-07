import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Selection } from "../content/catalog";
import { resolveSelection } from "../content/catalog";
const KEY = "stretch/last-started/v2";
const MUSIC_KEY = "stretch/music/v2";
let selected: Selection | null = null;
export function setSelection(value: Selection) {
  selected = value;
}
export function getSelection() {
  return selected;
}
export async function rememberStarted(value: Selection): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(value));
}
export async function readLastStarted(): Promise<Selection | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (
      !value ||
      ["id", "name", "subtitle", "color", "tag"].some(
        (k) => typeof value[k] !== "string",
      ) ||
      !Array.isArray(value.exerciseIds) ||
      value.exerciseIds.some((id: unknown) => typeof id !== "string")
    )
      return null;
    return resolveSelection(value).length ? value : null;
  } catch {
    return null;
  }
}
export async function readMusic(): Promise<boolean> {
  return (await AsyncStorage.getItem(MUSIC_KEY)) !== "off";
}
export async function saveMusic(enabled: boolean) {
  await AsyncStorage.setItem(MUSIC_KEY, enabled ? "on" : "off");
}
