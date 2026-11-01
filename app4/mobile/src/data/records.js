import { KeyValueStorage } from './storage';
import { canSaveRecord } from '../lib/gating';
import { isProUnlocked } from '../lib/entitlements';

const storage = new KeyValueStorage();
export const RECORDS_KEY = 'records/v1';

let records = [];
let initialized = false;
const listeners = new Set();

function notify() {
  for (const l of listeners) l(records);
}

function freeLimitError(kind = 'records') {
  const err = new Error('FREE_LIMIT');
  err.code = 'FREE_LIMIT';
  err.kind = kind;
  return err;
}

function newId() {
  return `rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const current = Number(raw.current);
  const max = Number(raw.max);
  const avg = Number(raw.avg);
  const min = Number(raw.min);
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    durationMs: Number.isFinite(Number(raw.durationMs)) ? Math.max(0, Number(raw.durationMs)) : 0,
    current: Number.isFinite(current) ? current : null,
    max: Number.isFinite(max) ? max : null,
    avg: Number.isFinite(avg) ? avg : null,
    min: Number.isFinite(min) ? min : null,
    // Old v1.1 records may still have `note`. Keep it so JSON parse/load
    // never throws; UI, CSV, and new writes ignore the field.
    note: typeof raw.note === 'string' ? raw.note : '',
    calibrationName: typeof raw.calibrationName === 'string' ? raw.calibrationName : '',
    offset: Number.isFinite(Number(raw.offset)) ? Number(raw.offset) : 0,
  };
}

export async function initRecords() {
  if (initialized) return records;
  try {
    const raw = await storage.getItem(RECORDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      records = Array.isArray(parsed) ? parsed.map(normalizeRecord).filter(Boolean) : [];
    }
  } catch {
    records = [];
  }
  initialized = true;
  notify();
  return records;
}

export function getRecords() {
  return records;
}

export function subscribeRecords(cb) {
  listeners.add(cb);
  cb(records);
  return () => listeners.delete(cb);
}

async function persist() {
  await storage.setItem(RECORDS_KEY, JSON.stringify(records));
  notify();
  return records;
}

export async function saveRecord(input) {
  const isPro = await isProUnlocked();
  if (!canSaveRecord({ recordCount: records.length, isPro })) {
    throw freeLimitError('records');
  }
  const rec = normalizeRecord({ ...input, id: input?.id || newId() });
  rec.note = '';
  records = [rec, ...records];
  await persist();
  return rec;
}

export async function deleteRecord(id) {
  records = records.filter((r) => r.id !== id);
  await persist();
}

export async function resetRecordsForTests() {
  initialized = false;
  records = [];
  notify();
}
