// Voice recording for "record yourself and compare". Recordings stay in memory and never leave the phone.
// ?nomic=1 forces the no-microphone path; ?fakemic=1 records a test tone (for checks without a microphone).
const q = new URLSearchParams(location.search);
const FAKE = q.has('fakemic');
const NOMIC = q.has('nomic');

export function canRecord() {
  if (NOMIC) return false;
  return !!(window.MediaRecorder && (FAKE || (navigator.mediaDevices && navigator.mediaDevices.getUserMedia)));
}

let fakeCtx = null;
function fakeStream() {
  fakeCtx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = fakeCtx.createOscillator(), dest = fakeCtx.createMediaStreamDestination();
  osc.frequency.value = 330;
  osc.connect(dest);
  osc.start();
  return dest.stream;
}

let lastUrl = null;

// start() resolves to a handle; handle.stop() resolves to a blob URL, or null if nothing was recorded.
export async function start(maxMs = 10000) {
  const stream = FAKE ? fakeStream() : await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  let timer = null;
  const stopped = new Promise((resolve) => {
    rec.onstop = () => {
      clearTimeout(timer);
      // Release the microphone before anything is played back: a live mic changes audio routing on iPhone.
      stream.getTracks().forEach((t) => t.stop());
      if (fakeCtx) { fakeCtx.close(); fakeCtx = null; }
      if (!chunks.length) return resolve(null);
      const blob = new Blob(chunks, { type: chunks[0].type || rec.mimeType || 'audio/webm' });
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = URL.createObjectURL(blob);
      resolve(lastUrl);
    };
    rec.onerror = () => resolve(null);
  });
  rec.start();
  const stop = () => { if (rec.state !== 'inactive') rec.stop(); return stopped; };
  timer = setTimeout(stop, maxMs);
  return { stop, stopped };
}
