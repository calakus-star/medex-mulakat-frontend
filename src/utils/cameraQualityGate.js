// İş emri — MÜLAKAT ÖNCESİ KAMERA KALİTE KAPISI
// TEK ORTAK frontend doğrulama modülü. L1 (Interview.js) ve L2/L3 (RealtimeInterview.js)
// AYNI bu modülü kullanır — brightness/frozen/detector kodu ekranlar arasında KOPYALANMAZ.
//
// GÜVENLİK SINIRI (iş emri madde 11): Bu bir UX/kalite/audit kapısıdır, kriptografik veya
// güvenlik garantisi DEĞİLDİR. Frontend JavaScript aday tarafından manipüle edilebilir.
// "UI bypass edilemez" veya "güvenli/biyometrik doğrulama" gibi bir iddia bu modülün veya
// onu kullanan hiçbir ekranın parçası DEĞİLDİR.
//
// Detector asset'leri (WASM + model) YALNIZ bu projenin kendi /public static dosyalarından
// servis edilir (public/wasm/, public/models/) — çalışma zamanında hiçbir CDN isteği YAPILMAZ
// (iş emri madde 3). @mediapipe/tasks-vision npm paketinin wasm/ klasörü ve Google'ın
// blaze_face_short_range modeli BUILD ZAMANINDA (geliştirici tarafından, bir kez) buraya
// kopyalanmıştır; runtime'da yalnız kendi origin'imizden okunur.

import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

const WASM_BASE_PATH = "/wasm";
const MODEL_PATH = "/models/blaze_face_short_range.tflite";

// İş emri madde 6 — tek kareyle karar verilmez; ~2-3 saniyede birkaç örnek.
const SAMPLE_COUNT = 6;
const SAMPLE_INTERVAL_MS = 420;
// İş emri madde 6 — analiz çözünürlüğü küçültülebilir, preview'a dokunulmaz (bu çözünürlük
// yalnız offscreen analiz canvas'ı için kullanılır, video/preview elementini DEĞİŞTİRMEZ).
const ANALYSIS_WIDTH = 320;
const ANALYSIS_HEIGHT = 240;

// İş emri madde 7 — deterministik parlaklık/boşluk eşikleri. Loş ortamı gereksiz yere
// reddetmeyecek kadar muhafazakâr: yalnız GERÇEKTEN siyah/kapalı/anlamsız-tek-renk kareler
// HARD FAIL sayılır.
const BLACK_MEAN_THRESHOLD = 10; // 0-255 ortalama parlaklık — bunun altı "neredeyse siyah"
const DARK_MEAN_THRESHOLD = 18; // bunun altı + düşük varyans = "çok karanlık/anlamsız"
const BLANK_VARIANCE_THRESHOLD = 4; // görüntüde pratik olarak hiç doku/kontrast yok

// İş emri madde 8 — donmuş kare: ardışık örnekler arası ortalama piksel farkı bu eşiğin
// altındaysa "değişmiyor" sayılır. Doğal sensör gürültüsü/mikro hareketi tolere eder — bu bir
// anti-spoofing sistemi değildir, adaydan bilinçli hareket İSTENMEZ.
const FROZEN_DIFF_THRESHOLD = 1.5;

export const MAX_SOFT_ATTEMPTS = 3;

let _detectorPromise = null;

// İş emri madde 4 — detector yüklenemezse (timeout/model yok/WASM desteklenmiyor/WebGL
// sorunu/init exception) uygulama ÇÖKMEZ; bu fonksiyon reddedilir, çağıran SOFT FAIL olarak
// ele alır. Başarısız promise cache'lenmez — bir sonraki denemede tekrar yüklenmeye çalışılır.
function loadFaceDetector() {
  if (!_detectorPromise) {
    _detectorPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE_PATH);
      return FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate: "CPU" },
        runningMode: "IMAGE",
        minDetectionConfidence: 0.5,
      });
    })();
    _detectorPromise.catch(() => { _detectorPromise = null; });
  }
  return _detectorPromise;
}

function grabFrame(video, canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = ANALYSIS_WIDTH;
  canvas.height = ANALYSIS_HEIGHT;
  ctx.drawImage(video, 0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);
  return ctx.getImageData(0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);
}

function luminanceStats(imageData) {
  const d = imageData.data;
  const n = d.length / 4;
  let sum = 0;
  const lums = new Float32Array(n);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    lums[j] = l;
    sum += l;
  }
  const mean = sum / n;
  let varSum = 0;
  for (let j = 0; j < n; j++) {
    const diff = lums[j] - mean;
    varSum += diff * diff;
  }
  return { mean, variance: varSum / n };
}

// Performans: her 4. pikseli örnekler (tam karşılaştırma gerekmez, donma tespiti içindir).
function frameDiff(a, b) {
  const da = a.data, db = b.data;
  let sum = 0, count = 0;
  for (let i = 0; i < da.length; i += 16) {
    sum += Math.abs(da[i] - db[i]);
    count++;
  }
  return count > 0 ? sum / count : 0;
}

// İş emri madde 5 — getUserMedia resolve olmuş olması YETERLİ DEĞİLDİR: track canlı mı,
// video boyutları var mı, readyState yeterli mi kontrol edilir.
export function checkVideoBasics(video) {
  if (!video || !video.srcObject) return { ok: false, reason: "no_stream" };
  const stream = video.srcObject;
  const track = stream.getVideoTracks ? stream.getVideoTracks()[0] : null;
  if (!track || track.readyState !== "live") return { ok: false, reason: "track_not_live" };
  if (video.readyState < 2) return { ok: false, reason: "video_not_ready" };
  if (!video.videoWidth || !video.videoHeight) return { ok: false, reason: "no_dimensions" };
  return { ok: true };
}

/**
 * TEK bir doğrulama denemesi çalıştırır: çoklu frame toplar, temel kalite (siyah/karanlık/
 * donmuş) ve — mevcutsa — kişi sayısı analizini yapar. Çağıran (sayfa bileşeni/paylaşılan UI)
 * HARD FAIL / SOFT FAIL / VERIFIED / UNVERIFIED akışını ve deneme sayacını yönetir; bu
 * fonksiyon PUAN/KARAR ÜRETMEZ, yalnız TEK bir denemenin deterministik sonucunu döner.
 *
 * Dönüş: {
 *   status: "verified" | "soft_fail" | "failed",
 *   hard: boolean,               // true ise HARD FAIL (madde A) — 3 deneme sınırı GEÇERSİZ
 *   reason: string,
 *   person_count: number|null,
 *   basic_video_ok: boolean,
 *   detector_available: boolean|null,
 *   timestamp: string (ISO),
 *   frameDataUrl: string|null,   // analiz edilen son kare (base64 JPEG) — mevcut snapshot
 *                                 // mekanizmasına ekleme için (backend'e persist ayrı adımda)
 * }
 */
export async function runCameraQualityCheck(video) {
  const timestamp = new Date().toISOString();
  const basics0 = checkVideoBasics(video);
  if (!basics0.ok) {
    return { status: "failed", hard: true, reason: basics0.reason, person_count: null,
             basic_video_ok: false, detector_available: null, timestamp, frameDataUrl: null };
  }

  const canvas = document.createElement("canvas");
  const frames = [];
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const b = checkVideoBasics(video);
    if (!b.ok) {
      return { status: "failed", hard: true, reason: b.reason, person_count: null,
               basic_video_ok: false, detector_available: null, timestamp, frameDataUrl: null };
    }
    frames.push(grabFrame(video, canvas));
    if (i < SAMPLE_COUNT - 1) await new Promise((r) => setTimeout(r, SAMPLE_INTERVAL_MS));
  }

  const majority = Math.ceil(SAMPLE_COUNT / 2);

  // --- Siyah / kapalı / karanlık — çoğunluk oyu (madde 7) ---
  const stats = frames.map(luminanceStats);
  const darkOrBlankCount = stats.filter(
    (s) => s.mean < BLACK_MEAN_THRESHOLD
      || s.variance < BLANK_VARIANCE_THRESHOLD
      || (s.mean < DARK_MEAN_THRESHOLD && s.variance < BLANK_VARIANCE_THRESHOLD * 2)
  ).length;
  if (darkOrBlankCount >= majority) {
    return { status: "failed", hard: true, reason: "black_or_dark_image", person_count: null,
             basic_video_ok: false, detector_available: null, timestamp,
             frameDataUrl: canvas.toDataURL("image/jpeg", 0.6) };
  }

  // --- Donmuş video (madde 8) — TÜM ardışık çiftler eşik altındaysa donmuş say ---
  let frozenPairs = 0;
  for (let i = 1; i < frames.length; i++) {
    if (frameDiff(frames[i - 1], frames[i]) < FROZEN_DIFF_THRESHOLD) frozenPairs++;
  }
  if (frozenPairs >= frames.length - 1) {
    return { status: "failed", hard: true, reason: "frozen_video", person_count: null,
             basic_video_ok: false, detector_available: null, timestamp,
             frameDataUrl: canvas.toDataURL("image/jpeg", 0.6) };
  }

  // Bu noktaya kadar temel kamera kalitesi SAĞLIKLI (canlı + kullanılabilir + siyah değil + donmuş değil).
  const basicVideoOk = true;
  const lastFrameDataUrl = canvas.toDataURL("image/jpeg", 0.75);

  // --- Kişi/yüz sayısı (madde 9) — detector SOFT FAIL güvenli ---
  let detector;
  try {
    detector = await loadFaceDetector();
  } catch (e) {
    return { status: "soft_fail", hard: false, reason: "detector_unavailable", person_count: null,
             basic_video_ok: basicVideoOk, detector_available: false, timestamp, frameDataUrl: lastFrameDataUrl };
  }

  let counts;
  try {
    counts = frames.map((f) => {
      const r = detector.detect(f);
      return r && Array.isArray(r.detections) ? r.detections.length : 0;
    });
  } catch (e) {
    return { status: "soft_fail", hard: false, reason: "detector_error", person_count: null,
             basic_video_ok: basicVideoOk, detector_available: false, timestamp, frameDataUrl: lastFrameDataUrl };
  }

  const twoPlusCount = counts.filter((c) => c >= 2).length;
  if (twoPlusCount >= majority) {
    return { status: "failed", hard: true, reason: "multiple_people", person_count: 2,
             basic_video_ok: basicVideoOk, detector_available: true, timestamp, frameDataUrl: lastFrameDataUrl };
  }

  const onePersonCount = counts.filter((c) => c === 1).length;
  if (onePersonCount >= majority) {
    return { status: "verified", hard: false, reason: "ok", person_count: 1,
             basic_video_ok: basicVideoOk, detector_available: true, timestamp, frameDataUrl: lastFrameDataUrl };
  }

  // 0 kişi / güvenilir olmayan sonuç — SOFT FAIL, tekrar denenebilir (madde 9).
  return { status: "soft_fail", hard: false, reason: "person_not_detected", person_count: 0,
           basic_video_ok: basicVideoOk, detector_available: true, timestamp, frameDataUrl: lastFrameDataUrl };
}
