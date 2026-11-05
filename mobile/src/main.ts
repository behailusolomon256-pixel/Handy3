import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import "./style.css";

type Saved = { id: number; text: string; language: string; createdAt: string };
const KEY = "handy-mobile-transcripts";
const root = document.querySelector<HTMLDivElement>("#app")!;
let listening = false;
let transcript = "";
let saved: Saved[] = JSON.parse(localStorage.getItem(KEY) || "[]");
let partialHandle: { remove: () => Promise<void> } | null = null;
let stateHandle: { remove: () => Promise<void> } | null = null;

function persist() { localStorage.setItem(KEY, JSON.stringify(saved.slice(0, 40))); }
function escapeHtml(s: string) { return s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c] || c)); }

function render() {
  root.innerHTML = '<main class="shell">' +
    '<header class="topbar"><div class="brand"><div class="brand-mark">h</div><div><strong>Handy</strong><span>Voice typing</span></div></div><div class="online"><i></i> Ready</div></header>' +
    '<section class="intro"><p class="eyebrow">SPEECH TO TEXT</p><h1>Your words,<br><em>in text.</em></h1><p class="sub">Tap the microphone and start speaking. Your words appear here as you talk.</p></section>' +
    '<section class="recorder"><div class="recorder-head"><span class="section-label">NEW TRANSCRIPTION</span><label class="language-label" for="language">LANGUAGE</label></div>' +
    '<select id="language" aria-label="Speech language"><option value="en-US">English</option><option value="am-ET">አማርኛ · Amharic</option></select>' +
    '<div class="transcript-box"><span class="placeholder" id="placeholder">Your transcription will appear here…</span><p id="transcript-text"></p></div>' +
    '<div class="recorder-actions"><button class="mic-button" id="record"><span>●</span><b id="record-label">Start speaking</b></button><button class="copy-button" id="copy">Copy text</button></div><p class="status" id="status" aria-live="polite">Microphone is off</p></section>' +
    '<section class="history"><div class="history-head"><div><p class="eyebrow">YOUR NOTES</p><h2>Recent transcripts</h2></div><span class="count">' + saved.length + '</span></div><div id="history-list"></div></section>' +
    '<footer>Handy for Android <span>·</span> Recognition depends on your device and language services.</footer></main>';

  const output = document.querySelector<HTMLParagraphElement>("#transcript-text")!;
  output.textContent = transcript;
  document.querySelector<HTMLSpanElement>("#placeholder")!.hidden = Boolean(transcript);
  document.querySelector<HTMLButtonElement>("#copy")!.disabled = !transcript.trim();
  const history = document.querySelector<HTMLDivElement>("#history-list")!;
  history.innerHTML = saved.length ? saved.map(item =>
    '<article class="history-item"><button class="history-text" data-open="' + item.id + '"><span>' +
    escapeHtml(item.text) + '</span><small>' + (item.language === "am-ET" ? "Amharic" : "English") +
    ' · ' + new Date(item.createdAt).toLocaleString() + '</small></button><button class="delete-button" data-delete="' + item.id + '">×</button></article>'
  ).join("") : '<p class="empty">Your saved transcripts will show up here.</p>';

  document.querySelector<HTMLButtonElement>("#record")!.addEventListener("click", () => listening ? stopRecording() : startRecording());
  document.querySelector<HTMLButtonElement>("#copy")!.addEventListener("click", copyTranscript);
  history.querySelectorAll<HTMLButtonElement>("[data-open]").forEach(button => button.addEventListener("click", () => {
    const item = saved.find(entry => entry.id === Number(button.dataset.open));
    if (item) { transcript = item.text; render(); }
  }));
  history.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach(button => button.addEventListener("click", () => {
    saved = saved.filter(entry => entry.id !== Number(button.dataset.delete)); persist(); render();
  }));
}

function status(message: string) {
  const el = document.querySelector<HTMLParagraphElement>("#status");
  if (el) el.textContent = message;
}
function setListening(value: boolean) {
  listening = value;
  const button = document.querySelector<HTMLButtonElement>("#record");
  const label = document.querySelector<HTMLElement>("#record-label");
  button?.classList.toggle("recording", value);
  if (label) label.textContent = value ? "Stop recording" : "Start speaking";
  status(value ? "Listening… speak naturally" : "Microphone is off");
}
async function cleanup() {
  await partialHandle?.remove(); await stateHandle?.remove();
  partialHandle = null; stateHandle = null;
}
async function startRecording() {
  try {
    const available = await SpeechRecognition.available();
    if (!available.available) { status("Speech recognition is unavailable on this device."); return; }
    const permission = await SpeechRecognition.requestPermissions();
    if (permission.speechRecognition !== "granted") { status("Allow microphone access in Android settings."); return; }
    const language = document.querySelector<HTMLSelectElement>("#language")!.value;
    partialHandle = await SpeechRecognition.addListener("partialResults", data => {
      const value = data.matches?.[0];
      if (!value) return;
      transcript = value;
      const output = document.querySelector<HTMLParagraphElement>("#transcript-text");
      if (output) output.textContent = transcript;
      const placeholder = document.querySelector<HTMLSpanElement>("#placeholder");
      if (placeholder) placeholder.hidden = true;
      const copy = document.querySelector<HTMLButtonElement>("#copy");
      if (copy) copy.disabled = !transcript.trim();
    });
    stateHandle = await SpeechRecognition.addListener("listeningState", data => {
      if (data.status === "started") setListening(true);
      if (data.status === "stopped") setListening(false);
    });
    setListening(true);
    await SpeechRecognition.start({ language, maxResults: 1, partialResults: true, popup: false });
    status("Listening… speak naturally");
  } catch (error) {
    setListening(false);
    status(error instanceof Error ? error.message : "Could not start speech recognition.");
    await cleanup();
  }
}
async function stopRecording() {
  try {
    await SpeechRecognition.stop();
    setListening(false);
    if (transcript.trim()) {
      const language = document.querySelector<HTMLSelectElement>("#language")?.value || "en-US";
      saved.unshift({ id: Date.now(), text: transcript.trim(), language, createdAt: new Date().toISOString() });
      saved = saved.slice(0, 40); persist(); render();
    }
  } catch (error) {
    status(error instanceof Error ? error.message : "Could not stop recording.");
  } finally { await cleanup(); }
}
async function copyTranscript() {
  if (!transcript.trim()) return;
  try { await navigator.clipboard.writeText(transcript); status("Copied to clipboard"); }
  catch { status("Copy unavailable. Select the text to copy it."); }
}
render();
