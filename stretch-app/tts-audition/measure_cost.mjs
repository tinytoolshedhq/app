#!/usr/bin/env node
// app5 試聽與成本實測：gpt-realtime-2.1-mini（只能走 Realtime API）
// 用法：node measure_cost.mjs [--dry-run] [--lang zh-TW|ja|en] [--voice marin] [--max-usd 0.50] [--out DIR]
// 金鑰只從 process.env.OPENAI_API_KEY 讀取；本腳本絕不印出、記錄或寫入金鑰或 authorization header。
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = "/workspace/audition-output/stretch";

// ---- 官方參數（查證日 2026-10-30）----
// 模型頁：https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini
// 價格頁：https://developers.openai.com/api/docs/pricing
// 事件流程：https://developers.openai.com/api/docs/guides/realtime-conversations
// 事件欄位（usage）：https://developers.openai.com/api/reference/resources/realtime/server-events
const MODEL = "gpt-realtime-2.1-mini";
const WS_URL = `wss://api.openai.com/v1/realtime?model=${MODEL}`;
const VOICES = ["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar"];
// 每 1M token 的美元價格（可調整）
const PRICE = {
  textInput: 0.60,
  textCachedInput: 0.06,
  textOutput: 2.40,
  audioInput: 10.0,
  audioOutput: 20.0,
};
// 輸出格式：audio/pcm 只支援 24kHz；PCM16 mono little-endian
const SAMPLE_RATE = 24000;
const BYTES_PER_SAMPLE = 2;
const CHANNELS = 1;

// ---- dry-run 估算用假設（實測後以 results.csv 為準）----
const ASSUME = {
  audioTokensPerSecond: 10,          // 假設值，需實測校正
  instructionTokens: 120,            // instructions + 包裝的文字 token
  charsPerSecond: { "zh-TW": 4.5, ja: 7, en: 15 },
  textTokensPerChar: { "zh-TW": 1.0, ja: 0.9, en: 0.25 },
  transcriptTokenRatio: 1.0,         // 輸出逐字稿 text tokens ≈ 輸入文字 tokens
};

// ---- 參數 ----
const argv = process.argv.slice(2);
const opt = { dryRun: false, lang: null, voice: "marin", maxUsd: 0.5, out: DEFAULT_OUT, reasoning: "minimal" };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--dry-run") opt.dryRun = true;
  else if (a === "--lang") opt.lang = argv[++i];
  else if (a === "--voice") opt.voice = argv[++i];
  else if (a === "--max-usd") opt.maxUsd = Number(argv[++i]);
  else if (a === "--out") opt.out = path.resolve(argv[++i]);
  else if (a === "--reasoning") opt.reasoning = argv[++i]; // "none" 表示不送 reasoning 欄位
  else if (a === "-h" || a === "--help") { console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 4).join("\n")); process.exit(0); }
  else { console.error(`未知參數：${a}`); process.exit(2); }
}
if (!VOICES.includes(opt.voice)) { console.error(`--voice 必須是：${VOICES.join(", ")}`); process.exit(2); }
if (!(opt.maxUsd > 0)) { console.error("--max-usd 必須是正數"); process.exit(2); }

// ---- 讀 cues ----
const allCues = JSON.parse(fs.readFileSync(path.join(HERE, "cues.json"), "utf8"));
const problems = [];
const seen = new Set();
for (const c of allCues) {
  for (const k of ["id", "lang", "exerciseId", "text"]) if (typeof c[k] !== "string" || !c[k].trim()) problems.push(`${c.id ?? "?"} 缺 ${k}`);
  if (seen.has(c.id)) problems.push(`重複 id ${c.id}`);
  seen.add(c.id);
  if (!ASSUME.charsPerSecond[c.lang]) problems.push(`${c.id} 未知語言 ${c.lang}`);
}
if (problems.length) { console.error("cues.json 有問題：\n" + problems.join("\n")); process.exit(1); }
const cues = opt.lang ? allCues.filter((c) => c.lang === opt.lang) : allCues;
if (!cues.length) { console.error(`沒有符合 --lang ${opt.lang} 的 cue`); process.exit(1); }

const charCount = (s) => [...s.replace(/\s+/g, "")].length;
const costOf = (u) =>
  (u.inText * PRICE.textInput + u.inCached * PRICE.textCachedInput + u.inAudio * PRICE.audioInput +
   u.outText * PRICE.textOutput + u.outAudio * PRICE.audioOutput) / 1e6;
function estimate(c, audioTokensPerSecond = ASSUME.audioTokensPerSecond) {
  const chars = charCount(c.text);
  const secs = chars / ASSUME.charsPerSecond[c.lang];
  const textTok = Math.ceil(chars * ASSUME.textTokensPerChar[c.lang]);
  const u = { inText: ASSUME.instructionTokens + textTok, inCached: 0, inAudio: 0,
    outText: Math.ceil(textTok * ASSUME.transcriptTokenRatio), outAudio: Math.ceil(secs * audioTokensPerSecond) };
  return { chars, secs, u, cost: costOf(u) };
}

function gitCapture(args, cwd) {
  try {
    return {
      ok: true,
      status: 0,
      text: execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(),
    };
  } catch (e) {
    return { ok: false, status: e.status ?? 1, text: "" };
  }
}

function nearestExistingRealpath(target) {
  let cur = path.resolve(target);
  while (!fs.existsSync(cur)) {
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return fs.realpathSync(cur);
}

function walkUpHasDotGit(dir) {
  let cur = dir;
  for (;;) {
    if (fs.existsSync(path.join(cur, ".git"))) return true;
    const parent = path.dirname(cur);
    if (parent === cur) return false;
    cur = parent;
  }
}

function isGitIgnored(outAbs, ancestor) {
  const top = gitCapture(["rev-parse", "--show-toplevel"], ancestor);
  if (!top.ok || !top.text) return false;
  const rel = path.relative(top.text, path.resolve(outAbs));
  if (path.isAbsolute(rel) || rel.startsWith(`..${path.sep}`) || rel === "..") return false;
  const chk = gitCapture(["check-ignore", "-q", "--", rel || "."], top.text);
  return chk.ok;
}

function inspectOutDir(outDir) {
  const abs = path.resolve(outDir);
  const ancestor = nearestExistingRealpath(abs);
  const rp = gitCapture(["rev-parse", "--is-inside-work-tree"], ancestor);
  const inside = rp.text === "true" || (!rp.ok && walkUpHasDotGit(ancestor));
  const ignored = inside && isGitIgnored(abs, ancestor);
  return { abs, ancestor, inside, ignored, blocked: inside && !ignored };
}

function assertOutAllowed(outDir, { dryRun }) {
  const info = inspectOutDir(outDir);
  if (dryRun) {
    let detail = `既有祖先 ${info.ancestor}`;
    if (!info.inside) detail += "，不在 git 工作區（通過）";
    else if (info.ignored) detail += "，位於 git 工作區但路徑已被 gitignore（通過）";
    else detail += "，位於 git 工作區且可被追蹤（拒絕）";
    console.log(`[dry-run] git 檢查：${detail}`);
  }
  if (info.blocked) {
    console.error(`錯誤：輸出目錄 ${info.abs} 位於 git 工作區內（既有祖先 ${info.ancestor}），拒絕執行以免音檔被提交。請用 --out 指到 repo 以外的路徑（預設 ${DEFAULT_OUT}）。`);
    process.exit(1);
  }
}

function maskSecrets(s) {
  return String(s ?? "").replace(/sk-[A-Za-z0-9_-]+/g, (m) => (
    m.length <= 5 ? `${m.slice(0, 3)}***` : `${m.slice(0, 3)}…${m.slice(-2)}`
  ));
}

// 一組 10 個動作的字數（以 exercises.zh-Hant.json 前 10 個動作的 voice_cues 估算）
function tenExerciseChars() {
  try {
    const ex = JSON.parse(fs.readFileSync(path.resolve(HERE, "..", "exercises.zh-Hant.json"), "utf8")).exercises;
    const ten = ex.slice(0, 10);
    const texts = ten.flatMap((e) => (e.voice_cues || []).map((v) => v.text));
    return { chars: texts.reduce((s, t) => s + charCount(t), 0), cues: texts.length, n: ten.length };
  } catch { return null; }
}

function summarize(rows, title) {
  const ten = tenExerciseChars();
  const byLang = {};
  for (const r of rows) (byLang[r.lang] ??= []).push(r);
  console.log(`\n== ${title}（依語言）==`);
  const summary = {};
  for (const [lang, rs] of Object.entries(byLang)) {
    const secs = rs.reduce((s, r) => s + r.audio_seconds, 0);
    const tok = rs.reduce((s, r) => s + r.output_audio_tokens, 0);
    const cost = rs.reduce((s, r) => s + r.cost_usd, 0);
    const chars = rs.reduce((s, r) => s + r.chars, 0);
    const perChar = cost / chars;
    const perCue = cost / rs.length;
    // 自訂轉換推估：以 zh 10 動作總字數 × 該語言每字成本（ja/en 只是同字數的粗估，見 README）
    const conv = ten ? { byChars: perChar * ten.chars, byCues: perCue * ten.cues } : null;
    summary[lang] = {
      cues: rs.length, audio_seconds: +secs.toFixed(2),
      avg_audio_tokens_per_second: +(tok / secs).toFixed(2),
      cost_per_second_usd: +(cost / secs).toFixed(6),
      cost_per_1000_chars_usd: +(perChar * 1000).toFixed(4),
      est_custom_conversion_usd: conv && { by_chars: +conv.byChars.toFixed(4), by_cue_count: +conv.byCues.toFixed(4) },
    };
    console.log(`${lang}: ${rs.length} 句, ${secs.toFixed(1)}s, 平均 ${(tok / secs).toFixed(2)} 音訊token/秒, US$${(cost / secs).toFixed(5)}/秒, US$${(perChar * 1000).toFixed(4)}/千字` +
      (conv ? `, 一次自訂轉換≈US$${conv.byChars.toFixed(4)}（依字數）/ US$${conv.byCues.toFixed(4)}（依句數）` : ""));
  }
  if (ten) console.log(`（10 動作基準：${ten.n} 個動作、${ten.cues} 句、${ten.chars} 字，取自 exercises.zh-Hant.json）`);
  return { ten, summary };
}

function csvRow(r) {
  return ["id", "lang", "chars", "input_text_tokens", "output_audio_tokens", "output_text_tokens", "audio_seconds", "audio_tokens_per_second", "cost_usd"]
    .map((k) => String(r[k]).includes(",") ? `"${r[k]}"` : r[k]).join(",");
}
const CSV_HEADER = "id,lang,chars,input_text_tokens,output_audio_tokens,output_text_tokens,audio_seconds,audio_tokens_per_second,cost_usd";

assertOutAllowed(opt.out, { dryRun: opt.dryRun });

// ---- dry-run：不連網、不碰金鑰值 ----
if (opt.dryRun) {
  console.log(`[dry-run] 不連網。模型 ${MODEL}，voice ${opt.voice}，上限 US$${opt.maxUsd.toFixed(2)}，輸出位置 ${opt.out}`);
  console.log(`[dry-run] OPENAI_API_KEY ${process.env.OPENAI_API_KEY ? "已設定" : "未設定"}（只檢查是否存在）`);
  const rows = cues.map((c) => { const e = estimate(c); return {
    id: c.id, lang: c.lang, chars: e.chars, input_text_tokens: e.u.inText, output_audio_tokens: e.u.outAudio,
    output_text_tokens: e.u.outText, audio_seconds: +e.secs.toFixed(2), audio_tokens_per_second: ASSUME.audioTokensPerSecond, cost_usd: +e.cost.toFixed(6) }; });
  const total = rows.reduce((s, r) => s + r.cost_usd, 0);
  console.log(`[dry-run] cues.json 檢查通過：${cues.length} 句（${[...new Set(cues.map((c) => c.lang))].join(", ")}）`);
  console.log(`[dry-run] 預估總花費 US$${total.toFixed(4)}（假設每秒 ${ASSUME.audioTokensPerSecond} 音訊 token，需實測校正）`);
  console.log(total > opt.maxUsd ? `[dry-run] 預估超過上限，實跑會停止。` : `[dry-run] 預估在上限內。`);
  summarize(rows, "預估摘要");
  process.exit(0);
}

// ---- 實跑 ----
if (!process.env.OPENAI_API_KEY) {
  console.error("錯誤：沒有 OPENAI_API_KEY 環境變數。請請黑嘛嘛透過 secret store 設定後再執行。");
  process.exit(1);
}
const preTotal = cues.reduce((s, c) => s + estimate(c).cost, 0);
if (preTotal > opt.maxUsd) { console.error(`預估 US$${preTotal.toFixed(4)} 超過上限 US$${opt.maxUsd}，停止。`); process.exit(1); }

let WebSocketImpl;
try { WebSocketImpl = (await import("ws")).default; }
catch { console.error("需要 ws 套件：請在 tts-audition/ 執行 npm ci --ignore-scripts"); process.exit(1); }

const instructionsFor = (lang) =>
  `You are a text-to-speech reader. Read the user's text aloud exactly, word for word, in ${lang === "zh-TW" ? "Taiwanese Mandarin (Traditional Chinese)" : lang === "ja" ? "natural standard Japanese" : "natural English"}. ` +
  "Do not add, drop, translate, or answer anything. No greetings, no comments. Calm, warm coach tone, steady pace.";

function writeWav(file, pcm) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(CHANNELS, 22);
  h.writeUInt32LE(SAMPLE_RATE, 24); h.writeUInt32LE(SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE, 28);
  h.writeUInt16LE(CHANNELS * BYTES_PER_SAMPLE, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, pcm]));
}

function speakOne(c) {
  return new Promise((resolve, reject) => {
    // header 只放在連線參數裡，任何錯誤訊息都不輸出 options
    const ws = new WebSocketImpl(WS_URL, { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } });
    const chunks = []; let transcript = "";
    const timer = setTimeout(() => { ws.terminate(); reject(new Error(`${c.id} 逾時`)); }, 60000);
    const fail = (msg) => { clearTimeout(timer); try { ws.close(); } catch {} reject(new Error(maskSecrets(msg))); };
    ws.on("error", (e) => fail(`${c.id} 連線錯誤：${e?.code ?? "unknown"}`)); // 不輸出 e 物件本身
    ws.on("unexpected-response", (_req, res) => fail(`${c.id} 連線被拒：HTTP ${res.statusCode}`));
    ws.on("open", () => {
      const session = { type: "realtime", model: MODEL, output_modalities: ["audio"], instructions: instructionsFor(c.lang),
        audio: { input: { turn_detection: null }, output: { format: { type: "audio/pcm", rate: SAMPLE_RATE }, voice: opt.voice } } };
      if (opt.reasoning !== "none") session.reasoning = { effort: opt.reasoning };
      ws.send(JSON.stringify({ type: "session.update", session }));
      ws.send(JSON.stringify({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: c.text }] } }));
      ws.send(JSON.stringify({ type: "response.create", response: { output_modalities: ["audio"] } }));
    });
    ws.on("message", (raw) => {
      let ev; try { ev = JSON.parse(raw.toString()); } catch { return; }
      if (ev.type === "response.output_audio.delta") chunks.push(Buffer.from(ev.delta, "base64"));
      else if (ev.type === "response.output_audio_transcript.done") transcript = ev.transcript ?? "";
      else if (ev.type === "error") fail(`${c.id} API 錯誤：${maskSecrets(`${ev.error?.type ?? ""} ${ev.error?.code ?? ""} ${ev.error?.message ?? ""}`)}`);
      else if (ev.type === "response.done") {
        clearTimeout(timer); ws.close();
        if (ev.response?.status !== "completed") return reject(new Error(`${c.id} 回應狀態 ${ev.response?.status}`));
        resolve({ pcm: Buffer.concat(chunks), usage: ev.response.usage ?? {}, transcript });
      }
    });
  });
}

fs.mkdirSync(opt.out, { recursive: true });
const rows = []; let spent = 0;
let audioTokPerSec = ASSUME.audioTokensPerSecond;
for (let i = 0; i < cues.length; i++) {
  const c = cues[i];
  const est = estimate(c, audioTokPerSec).cost;
  if (spent + est > opt.maxUsd) { console.error(`已花 US$${spent.toFixed(4)}，下一句預估會超過上限，停止。`); break; }
  let r;
  try { r = await speakOne(c); } catch (e) { console.error(maskSecrets(e.message)); break; }
  const ud = r.usage, inD = ud.input_token_details ?? {}, outD = ud.output_token_details ?? {};
  const cached = inD.cached_tokens_details ?? {};
  const outText = outD.text_tokens ?? 0, outAudio = outD.audio_tokens ?? 0;
  // 推理 token 若存在，計入 output 但不在 details 裡：以 output_tokens 差額按文字輸出價計
  const extraOut = Math.max(0, (ud.output_tokens ?? 0) - outText - outAudio);
  const u = { inText: (inD.text_tokens ?? 0) - (cached.text_tokens ?? 0), inCached: cached.text_tokens ?? 0,
    inAudio: inD.audio_tokens ?? 0, outText: outText + extraOut, outAudio };
  const cost = costOf(u); spent += cost;
  const secs = r.pcm.length / (SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS);
  const dir = path.join(opt.out, c.lang); fs.mkdirSync(dir, { recursive: true });
  writeWav(path.join(dir, `${c.id}.${opt.voice}.wav`), r.pcm);
  fs.appendFileSync(path.join(dir, "transcripts.tsv"), `${c.id}\t${c.text}\t${r.transcript.replace(/\s+/g, " ")}\n`);
  const row = { id: c.id, lang: c.lang, chars: charCount(c.text), input_text_tokens: inD.text_tokens ?? 0, output_audio_tokens: outAudio,
    output_text_tokens: outText, audio_seconds: +secs.toFixed(3), audio_tokens_per_second: +(outAudio / secs).toFixed(2), cost_usd: +cost.toFixed(6) };
  rows.push(row);
  console.log(`${c.id}: ${secs.toFixed(2)}s, 音訊 ${outAudio} tok, US$${cost.toFixed(5)}（累計 US$${spent.toFixed(4)}）`);
  if (i === 0 && secs > 0 && outAudio > 0) {
    audioTokPerSec = outAudio / secs;
    const remaining = cues.slice(1).reduce((s, x) => s + estimate(x, audioTokPerSec).cost, 0);
    const projected = spent + remaining;
    console.log(`第一句後校正：每秒 ${audioTokPerSec.toFixed(2)} 音訊 token；重估總花費 US$${projected.toFixed(4)}`);
    if (projected > opt.maxUsd) {
      console.error(`校正後預估 US$${projected.toFixed(4)} 超過上限 US$${opt.maxUsd}，停止。`);
      break;
    }
  }
}
if (rows.length) {
  fs.writeFileSync(path.join(opt.out, "results.csv"), [CSV_HEADER, ...rows.map(csvRow)].join("\n") + "\n");
  const s = summarize(rows, "實測摘要");
  fs.writeFileSync(path.join(opt.out, "summary.json"), JSON.stringify({ model: MODEL, voice: opt.voice, price_per_1m: PRICE,
    format: { type: "audio/pcm", sample_rate: SAMPLE_RATE, bits: 16, channels: CHANNELS }, total_usd: +spent.toFixed(6), ...s }, null, 2));
  console.log(`\n輸出：${opt.out}（results.csv、summary.json、各語言資料夾的 wav 與 transcripts.tsv）`);
}
