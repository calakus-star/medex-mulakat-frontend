import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API_URL } from "../App";

const formatTime = (s) => {
  const safe = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(safe / 60)}:${(safe % 60).toString().padStart(2, "0")}`;
};

// Faz D1: OpenAI Realtime oturumları platform tarafından en fazla 60 dk sürüyor. L3 "derin" hedefi
// (LEVEL_CONFIG[3] × DEPTH_TIER_CONFIG["derin"] = 30×1.6 = 48 dk) adaptif ve sabit tavansız olduğu
// için pratikte bu sınıra yaklaşabilir. 55 dk'da (5 dk pay) AI'a kapanışı tamamlaması söylenir;
// yalnızca Level 3'te devreye girer, L1/L2 hiç etkilenmez.
const REALTIME_L3_SAFE_LIMIT_SECONDS = 55 * 60;

// ==== Konuşma durumu görsel göstergesi: sese tepki veren tek merkezi halka (metin etiketi yok) ====
function VoiceOrb({ phase, level }) {
  const config = {
    listening: { color: "#10b981" },
    speaking: { color: "#3b82f6" },
    thinking: { color: "#94a3b8" },
    idle: { color: "#94a3b8" },
  };
  const { color } = config[phase] || config.idle;
  const active = phase === "listening" || phase === "speaking";
  // level: 0-1 arası anlık ses genliği (AnalyserNode'dan) — halkanın büyüklüğünü
  // gerçek zamanlı olarak sese göre değiştirir. Konuşma akışına müdahale etmez,
  // sadece mevcut ses akışını PASİF olarak dinleyip görsele yansıtır.
  const boost = active ? Math.min(1, level || 0) : 0;
  const outerSize = 156 + boost * 40;
  const innerSize = 104 + boost * 18;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
      <div style={{
        width: outerSize, height: outerSize, borderRadius: "50%",
        background: `radial-gradient(circle, ${color}${active ? "22" : "14"} 0%, transparent 72%)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "width 0.08s ease-out, height 0.08s ease-out, background 0.4s ease",
      }}>
        <div style={{
          width: innerSize, height: innerSize, borderRadius: "50%",
          background: `linear-gradient(145deg, ${color}, #0f172a)`,
          boxShadow: active ? `0 0 0 3px ${color}30, 0 8px 24px rgba(15,23,42,0.18)` : "0 4px 14px rgba(15,23,42,0.12)",
          transition: "width 0.08s ease-out, height 0.08s ease-out, box-shadow 0.4s ease, background 0.5s ease",
        }} />
      </div>
    </div>
  );
}

export default function RealtimeInterview() {
  const navigate = useNavigate();
  const token = localStorage.getItem("candidate_token");

  const [step, setStep] = useState("camera"); // camera -> cv -> ready -> live -> finished
  const [candidate, setCandidate] = useState(null);
  const [cameraError, setCameraError] = useState("");
  const [cvFile, setCvFile] = useState(null);
  const [cvUploading, setCvUploading] = useState(false);
  const [cvError, setCvError] = useState("");
  const [connectError, setConnectError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle | listening | speaking | thinking
  const phaseRef = useRef("idle"); // rAF döngüsünde güncel phase'e state closure'ı olmadan erişmek için
  const [level, setLevel] = useState(0); // 0-1 arası anlık ses genliği — halkanın büyüklüğü için
  const [elapsed, setElapsed] = useState(0);
  const [estimatedCost, setEstimatedCost] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [finished, setFinished] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [reportResult, setReportResult] = useState(null);
  const [debugLog, setDebugLog] = useState([]);
  const [connStatus, setConnStatus] = useState({ sdp: "-", ice: "-", peer: "-", track: "Henüz alınmadı", playback: "-" });
  const hasActiveResponseRef = useRef(false);
  const candidateSpeechActiveRef = useRef(false);
  const bargeInConfirmTimerRef = useRef(null);
  const logDebug = (msg) => {
    const line = `${new Date().toLocaleTimeString("tr-TR")} — ${msg}`;
    console.log("[Realtime Debug]", line);
    setDebugLog(prev => [...prev.slice(-39), line]);
  };

  const streamRef = useRef(null);
  const videoRef = useRef(null);
  const attachVideoRef = useCallback((node) => {
    videoRef.current = node;
    if (node && streamRef.current) node.srcObject = streamRef.current;
  }, []);

  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const micStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const ensureAudioPlaybackRef = useRef(() => {});
  const sendInitialOpeningRef = useRef(() => {});
  const startTsRef = useRef(null);
  const elapsedRef = useRef(0);
  const timerRef = useRef(null);
  const startInterviewClock = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    startTsRef.current = Date.now();
    elapsedRef.current = 0;
    setElapsed(0);
    const tick = () => {
      if (!startTsRef.current) return;
      const value = Math.max(0, (Date.now() - startTsRef.current) / 1000);
      elapsedRef.current = value;
      setElapsed(Math.floor(value));
    };
    tick();
    timerRef.current = window.setInterval(tick, 500);
  }, []);
  const initialResponseSentRef = useRef(false);
  const openingCompletedRef = useRef(false);
  const openingFallbackTimerRef = useRef(null);
  const transcriptRef = useRef([]); // [{role:'aday'|'mülakatçı', text}]
  const answeredCountRef = useRef(0);
  const assistantDeltaRef = useRef("");
  const finishedRef = useRef(false);
  const submitReportRef = useRef(() => {});
  // Ses seviyesi görselleştirme: mevcut mikrofon/AI ses akışlarını PASİF olarak (salt-okunur,
  // ayrı bir AnalyserNode ile) dinleyip halkanın büyüklüğünü sese göre değiştirir. Bu, gerçek
  // konuşma/gönderim akışına (WebRTC, mikrofon açık/kapalı durumu, turn detection) hiç
  // müdahale etmez — sadece var olan stream'lerin bir kopyasını izler.
  const audioCtxRef = useRef(null);
  const micAnalyserRef = useRef(null);
  const micRmsRef = useRef(0);
  const remoteAnalyserRef = useRef(null);
  const remotePlaybackCtxRef = useRef(null);
  const remotePlaybackSourceRef = useRef(null);
  const remotePlaybackGainRef = useRef(null);
  const closingFallbackTimerRef = useRef(null);
  const levelRafRef = useRef(null);
  const hardCloseTriggeredRef = useRef(false); // Faz D1: 55 dk güvenli kapanışı bir kez tetikle
  const realtimeEventsBufferRef = useRef([]); // Faz D1: sync/report ile backend'e taşınacak ham olaylar
  const realtimeUsageRef = useRef({
    input_tokens: 0,
    output_tokens: 0,
    audio_input_tokens: 0,
    audio_output_tokens: 0,
    cached_input_tokens: 0,
    cached_audio_input_tokens: 0,
    response_count: 0,
  });
  // En son backend'e (heartbeat veya final) gönderilmiş kümülatif usage — delta hesaplamak için.
  const syncedUsageRef = useRef({ input_tokens: 0, output_tokens: 0, audio_input_tokens: 0, audio_output_tokens: 0, cached_input_tokens: 0, cached_audio_input_tokens: 0 });
  const heartbeatRef = useRef(null);
  const endInterviewHandledRef = useRef(false); // aynı end_interview tool call'ı 2 farklı event'ten çift işlememek için
  const coverageThresholdRef = useRef(60); // depth_tier'a göre backend'den gelen kriter kapsanma eşiği
  // /api/realtime/session yanıtındaki AI_PRICING_PER_1M satırı — maliyet formülü SADECE burayı okur,
  // backend'deki fiyat tablosuyla iki ayrı kopya olarak sapmasın diye kendi rakamını taşımaz.
  const pricingRef = useRef({});
  const criteriaNamesRef = useRef([]); // pozisyonun kriter adları — kapsanma kontrolü için
  // BUG FIX: L2 (sesli) mülakatta kamera açılıyordu ama hiçbir yerde kare yakalanıp
  // backend'e gönderilmiyordu (bu mantık sadece L1/metin mülakatında vardı). Aynı deseni
  // burada da uyguluyoruz — sabit bir toplam süre olmadığı için oran yerine mutlak saniye
  // kontrol noktaları kullanılır (erken/orta/geç/son).
  const snapshotTakenRef = useRef([false, false, false, false]);
  const savedSnapshotCountRef = useRef(0);
  const snapshotInFlightRef = useRef(false);

  useEffect(() => {
    if (!token) { navigate("/mulakat"); return; }
    const info = localStorage.getItem("candidate_info");
    if (info) {
      try { setCandidate(JSON.parse(info)); } catch (e) { /* yoksay */ }
    }
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      cleanupRealtime();
    };
  }, []);

  // Sayaç için ikinci güvenlik ağı: canlı ekran açık olduğu sürece tek zaman kaynağından güncelle.
  // Böylece bağlantı akışındaki yeniden render/olaylar sayacı 0:00'da bırakamaz.
  useEffect(() => {
    if (step !== "live" || finished) return;
    if (!startTsRef.current) startTsRef.current = Date.now();
    const tick = () => {
      const value = Math.max(0, (Date.now() - startTsRef.current) / 1000);
      elapsedRef.current = value;
      setElapsed(Math.floor(value));
      // Faz D1 GÜVENLİ KAPANIŞ — SADECE Level 3: platform 60 dk sınırına yaklaşılınca AI'a
      // kapanışı tamamlamasını söyleriz; end_interview çağırmazsa (bağlantı/gecikme riski) kısa
      // bir bekleme sonrası zorla rapor üretilir. L1/L2 bu koşula hiç girmez, hiçbir etkisi yok.
      if (candidate?.level === 3 && value >= REALTIME_L3_SAFE_LIMIT_SECONDS && !hardCloseTriggeredRef.current && !finishedRef.current) {
        hardCloseTriggeredRef.current = true;
        logDebug(`⏱️ Güvenli kapanış tetiklendi — ${Math.floor(REALTIME_L3_SAFE_LIMIT_SECONDS / 60)} dk sınırına ulaşıldı (platform sınırı 60 dk).`);
        try {
          if (dcRef.current?.readyState === "open") {
            dcRef.current.send(JSON.stringify({
              type: "response.create",
              response: {
                instructions: "Süre sınırına yaklaşıldı. Mülakatı hemen sonlandırman gerekiyor: önce kısa bir kapanış sorusu sor (\"Eklemek veya öne çıkarmak istediğiniz başka bir şey var mı?\"), adayın cevabını dinle, kısaca teşekkür et ve end_interview fonksiyonunu reason='tamamlandı' ile hemen çağır."
              }
            }));
          }
        } catch (err) { /* yoksay */ }
        if (closingFallbackTimerRef.current) clearTimeout(closingFallbackTimerRef.current);
        closingFallbackTimerRef.current = setTimeout(() => {
          if (!finishedRef.current) submitReportRef.current("tamamlandı");
        }, 25000);
      }
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [step, finished, candidate]);

  // ===== Kamera izni =====
  const requestCamera = async () => {
    setCameraError("");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError("Tarayıcınız kamera erişimini desteklemiyor.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      setStep("cv");
    } catch (e) {
      setCameraError("Kamera izni alınamadı. Lütfen tarayıcı ayarlarından izin verip tekrar deneyin.");
    }
  };

  useEffect(() => {
    if (streamRef.current && videoRef.current && !videoRef.current.srcObject) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [step]);

  const uploadCV = async () => {
    if (!cvFile) return;
    setCvUploading(true);
    setCvError("");
    try {
      const formData = new FormData();
      formData.append("file", cvFile);
      await axios.post(`${API_URL}/api/candidate/upload-cv`, formData, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" }
      });
      setStep("ready");
    } catch (e) {
      setCvError("CV yüklenemedi: " + (e.response?.data?.detail || "bilinmeyen hata") + ". Bu seviyede CV zorunlu.");
    } finally {
      setCvUploading(false);
    }
  };

  // ===== Realtime bağlantısını temizle =====
  const cleanupRealtime = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (closingFallbackTimerRef.current) { clearTimeout(closingFallbackTimerRef.current); closingFallbackTimerRef.current = null; }
    if (bargeInConfirmTimerRef.current) { clearTimeout(bargeInConfirmTimerRef.current); bargeInConfirmTimerRef.current = null; }
    if (openingFallbackTimerRef.current) { clearTimeout(openingFallbackTimerRef.current); openingFallbackTimerRef.current = null; }
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    if (dcRef.current) { try { dcRef.current.close(); } catch (e) {} }
    if (pcRef.current) { try { pcRef.current.close(); } catch (e) {} }
    if (micStreamRef.current) micStreamRef.current.getTracks().forEach(t => t.stop());
    if (remoteAudioRef.current) { try { remoteAudioRef.current.pause(); remoteAudioRef.current.remove(); } catch (e) {} }
    if (levelRafRef.current) { cancelAnimationFrame(levelRafRef.current); levelRafRef.current = null; }
    if (remotePlaybackSourceRef.current) { try { remotePlaybackSourceRef.current.disconnect(); } catch (e) {} remotePlaybackSourceRef.current = null; }
    if (remotePlaybackGainRef.current) { try { remotePlaybackGainRef.current.disconnect(); } catch (e) {} remotePlaybackGainRef.current = null; }
    if (remotePlaybackCtxRef.current) { try { remotePlaybackCtxRef.current.close(); } catch (e) {} remotePlaybackCtxRef.current = null; }
    if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch (e) {} audioCtxRef.current = null; }
    micAnalyserRef.current = null; remoteAnalyserRef.current = null;
    pcRef.current = null; dcRef.current = null; micStreamRef.current = null; remoteAudioRef.current = null;
    ensureAudioPlaybackRef.current = () => {};
  };

  // Verilen stream'i PASİF olarak (analyser çıkışı hiçbir yere bağlanmaz, ses üretmez/değiştirmez)
  // dinleyip bir AnalyserNode döndürür. Mevcut ses gönderim/oynatma akışını etkilemez.
  const getOrCreateAudioCtx = () => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = new Ctx();
    }
    return audioCtxRef.current;
  };
  const attachAnalyser = (stream, targetRef) => {
    try {
      const ctx = getOrCreateAudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser); // çıkışı destination'a BAĞLANMIYOR — sadece analiz için tap
      targetRef.current = analyser;
    } catch (e) {
      logDebug("⚠️ Ses seviyesi analizörü kurulamadı: " + (e.message || e));
    }
  };
  // TEK VE STABİL SES ÇIKIŞ YOLU:
  // Remote WebRTC stream Web Audio API üzerinden hoparlöre bağlanır. HTMLAudioElement
  // sadece fallback olarak tutulur; iki yol aynı anda ses üretmez (çift ses/yankı yok).
  const attachRemotePlayback = async (stream, reason = "remote") => {
    try {
      if (!stream) return false;
      const ctx = remotePlaybackCtxRef.current;
      if (!ctx) throw new Error("AudioContext kullanıcı tıklaması sırasında oluşturulmadı");
      if (ctx.state === "suspended") await ctx.resume();

      if (remotePlaybackSourceRef.current) {
        try { remotePlaybackSourceRef.current.disconnect(); } catch (e) {}
      }
      if (remotePlaybackGainRef.current) {
        try { remotePlaybackGainRef.current.disconnect(); } catch (e) {}
      }

      const source = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      gain.gain.value = 1.0;
      source.connect(gain);
      gain.connect(ctx.destination);
      remotePlaybackSourceRef.current = source;
      remotePlaybackGainRef.current = gain;

      // WebAudio çalışıyorsa HTML audio sessiz fallback olur; aynı sesi iki kez çalmaz.
      if (remoteAudioRef.current) remoteAudioRef.current.muted = true;
      logDebug(`WebAudio hoparlör çıkışı aktif (${reason}). state=${ctx.state}`);
      setConnStatus(st => ({ ...st, playback: "WebAudio aktif" }));
      return true;
    } catch (e) {
      logDebug("⚠️ WebAudio çıkışı kurulamadı, HTML audio fallback: " + (e.message || e));
      if (remoteAudioRef.current) {
        remoteAudioRef.current.muted = false;
        remoteAudioRef.current.volume = 1;
        ensureAudioPlaybackRef.current("html-fallback");
      }
      return false;
    }
  };

  const startLevelLoop = () => {
    const buf = new Uint8Array(128);
    const tick = () => {
      const analyser = phaseRef.current === "speaking" ? remoteAnalyserRef.current : micAnalyserRef.current;
      if (analyser) {
        analyser.getByteTimeDomainData(buf);
        let sumSquares = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sumSquares += v * v;
        }
        const rms = Math.sqrt(sumSquares / buf.length);
        setLevel(prev => prev * 0.7 + Math.min(1, rms * 4) * 0.3);
      }
      // Barge-in doğrulamasında AI sesini değil, mikrofonun gerçek seviyesini kullan.
      if (micAnalyserRef.current) {
        micAnalyserRef.current.getByteTimeDomainData(buf);
        let micSum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          micSum += v * v;
        }
        micRmsRef.current = Math.sqrt(micSum / buf.length);
      }
      levelRafRef.current = requestAnimationFrame(tick);
    };
    levelRafRef.current = requestAnimationFrame(tick);
  };

  const appendTranscript = (role, text) => {
    if (!text || !text.trim()) return;
    // BÖLÜM 2.1: her satıra mülakat başından beri geçen süre (elapsed_ms) — transkriptte [mm:ss].
    transcriptRef.current.push({ role, text: text.trim(), ms: Math.round((elapsedRef.current || 0) * 1000) });
  };

  // Faz D1: ham Realtime olaylarını (şu ana kadar sadece konsola yazılıp kayboluyordu) backend'e
  // taşınmak üzere tamponlar. Metrik HESAPLAMAZ — sadece toplar; D2 bu veriden metrik çıkaracak.
  const pushRealtimeEvent = (type, data) => {
    realtimeEventsBufferRef.current.push({
      type, data: data || {}, elapsed_ms: Math.round((elapsedRef.current || 0) * 1000),
    });
  };
  // splice ile ATOMİK boşaltma: gönderim sırasında (await beklerken) yeni pushRealtimeEvent
  // çağrıları aynı diziye değil, splice sonrası kalan (boş) diziye eklenir — kayıp/çift kayıt olmaz.
  // Gönderim başarısız olursa o turdaki olaylar kaybolur (usage_delta'nın aksine kümülatif değil) —
  // D1 kapsamında kabul edilebilir, sadece gözlemlenebilirlik verisi, rapor/maliyet etkilemez.
  const drainRealtimeEvents = () => realtimeEventsBufferRef.current.splice(0, realtimeEventsBufferRef.current.length);

  // FAZ D: modelin note_voice_observation tool call'ı — mevcut event buffer'ına yazılır
  // (yeni taşıma yolu YOK). call_id ile dedupe (aynı call hem _arguments.done hem
  // _output_item.done'dan gelir) + istemci tarafı sert üst sınır (5). Backend'e
  // function_call_output/response GÖNDERİLMEZ — tool yanıta bağlanmaz, ses akışı kesilmez.
  const voiceObsHandledRef = useRef(new Set());
  const voiceObsCountRef = useRef(0);
  const recordVoiceObservation = (callId, argsJson) => {
    const key = callId || `single_${voiceObsCountRef.current}`;
    if (voiceObsHandledRef.current.has(key)) return;
    voiceObsHandledRef.current.add(key);
    if (voiceObsCountRef.current >= 5) return;
    let parsed = {};
    try { parsed = JSON.parse(argsJson || "{}"); } catch (e) { return; }
    voiceObsCountRef.current += 1;
    pushRealtimeEvent("note_voice_observation", {
      ton: parsed.ton ?? null,
      akicilik: typeof parsed.akicilik === "number" ? parsed.akicilik : null,
      tereddut: typeof parsed.tereddut === "number" ? parsed.tereddut : null,
      gozlem: (parsed.gozlem || "").slice(0, 500),
    });
    logDebug(`Ses gözlemi kaydedildi (${voiceObsCountRef.current}/5).`);
  };

  // Fiyat backend'in AI_PRICING_PER_1M'inden gelir (pricingRef, session açılışında dolduruluyor) —
  // burada sabit sayı YOK, tek kaynak backend. cached_* alanları input/audio_input'ın ALT KÜMESİDİR.
  const estimateRealtimeCost = (u) => {
    const rates = pricingRef.current || {};
    const cachedInput = Math.min(u.cached_input_tokens || 0, u.input_tokens);
    const cachedAudioInput = Math.min(u.cached_audio_input_tokens || 0, u.audio_input_tokens);
    const freshInput = Math.max(0, u.input_tokens - cachedInput);
    const freshAudioInput = Math.max(0, u.audio_input_tokens - cachedAudioInput);
    return (
      freshInput * (rates.input ?? 0) +
      cachedInput * (rates.input_cached ?? rates.input ?? 0) +
      u.output_tokens * (rates.output ?? 0) +
      freshAudioInput * (rates.audio_input ?? 0) +
      cachedAudioInput * (rates.audio_input_cached ?? rates.audio_input ?? 0) +
      u.audio_output_tokens * (rates.audio_output ?? 0)
    ) / 1000000;
  };

  const addRealtimeUsage = (usage) => {
    if (!usage) return;
    const safeNum = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
    const detailsIn = usage.input_token_details || usage.input_tokens_details || {};
    const detailsOut = usage.output_token_details || usage.output_tokens_details || {};
    const cachedDetails = detailsIn.cached_tokens_details || detailsIn.cached_tokens_detail || {};
    const inputTokens = safeNum(usage.input_tokens) || safeNum(usage.prompt_tokens);
    const outputTokens = safeNum(usage.output_tokens) || safeNum(usage.completion_tokens);
    const audioInput = safeNum(detailsIn.audio_tokens || detailsIn.audio);
    const audioOutput = safeNum(detailsOut.audio_tokens || detailsOut.audio);
    // OpenAI Realtime usage şeması: input_token_details.cached_tokens = TOPLAM cache'li girdi
    // (metin+ses); cached_tokens_details.{text_tokens,audio_tokens} ayrımı varsa onu kullan,
    // yoksa toplam cache'i tamamen metin girdisine ait say (ses cache'ini olduğundan düşük
    // göstermek, olduğundan yüksek göstermekten daha güvenli bir varsayılan).
    const cachedAudioInput = safeNum(cachedDetails.audio_tokens || cachedDetails.audio);
    const cachedTotal = safeNum(detailsIn.cached_tokens);
    const cachedTextInput = cachedDetails.text_tokens !== undefined
      ? safeNum(cachedDetails.text_tokens)
      : Math.max(0, cachedTotal - cachedAudioInput);
    realtimeUsageRef.current.input_tokens += Math.max(0, inputTokens - audioInput);
    realtimeUsageRef.current.output_tokens += Math.max(0, outputTokens - audioOutput);
    realtimeUsageRef.current.audio_input_tokens += audioInput;
    realtimeUsageRef.current.audio_output_tokens += audioOutput;
    realtimeUsageRef.current.cached_input_tokens += cachedTextInput;
    realtimeUsageRef.current.cached_audio_input_tokens += cachedAudioInput;
    realtimeUsageRef.current.response_count += 1;
    const cost = estimateRealtimeCost(realtimeUsageRef.current);
    setEstimatedCost(cost);
    logDebug(`Usage yakalandı: in=${inputTokens}, out=${outputTokens}, audio_in=${audioInput}, audio_out=${audioOutput}, cached_in=${cachedTextInput}, cached_audio_in=${cachedAudioInput}, tahmini=$${cost.toFixed(4)}`);

    // Maliyet yalnızca izlenir; görüşme parasal eşik nedeniyle ASLA kesilmez.
    // Tasarruf, kısa mülakatçı cevapları ve bağlam yönetimiyle sağlanır.
  };

  // Son sync'ten bu yana biriken FARKI hesaplar (kümülatif değil) — böylece backend'de
  // her sync/heartbeat kendi payını ekler, aynı token'lar iki kez sayılmaz.
  const computeUsageDelta = () => {
    const cur = realtimeUsageRef.current;
    const prev = syncedUsageRef.current;
    return {
      input_tokens: Math.max(0, cur.input_tokens - prev.input_tokens),
      output_tokens: Math.max(0, cur.output_tokens - prev.output_tokens),
      audio_input_tokens: Math.max(0, cur.audio_input_tokens - prev.audio_input_tokens),
      audio_output_tokens: Math.max(0, cur.audio_output_tokens - prev.audio_output_tokens),
      cached_input_tokens: Math.max(0, cur.cached_input_tokens - prev.cached_input_tokens),
      cached_audio_input_tokens: Math.max(0, cur.cached_audio_input_tokens - prev.cached_audio_input_tokens),
    };
  };
  const markUsageSynced = () => { syncedUsageRef.current = { ...realtimeUsageRef.current }; };

  const currentTranscriptText = () =>
    transcriptRef.current.map(t => {
      const s = Math.max(0, Math.round((t.ms || 0) / 1000));
      const stamp = `[${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}] `;
      return `${stamp}${t.role === "aday" ? "Aday" : "Mülakatçı"}: ${t.text}`;
    }).join("\n");

  // Görüşme SÜRERKEN periyodik ara kayıt: submitReport hiç tetiklenmezse bile (sekme kapandı,
  // bağlantı koptu, AI end_interview'i hiç çağırmadı) transkript ve token kullanımı tamamen
  // kaybolmasın diye. Rapor üretmez, ucuz bir DB yazımıdır.
  const syncProgress = useCallback(async () => {
    if (finishedRef.current || !candidate?.id) return;
    const delta = computeUsageDelta();
    const events = drainRealtimeEvents();
    try {
      await axios.post(`${API_URL}/api/realtime/sync`, {
        candidate_id: candidate.id,
        transcript: currentTranscriptText(),
        duration_seconds: Math.floor(elapsedRef.current),
        answered_count: answeredCountRef.current,
        usage_delta: delta,
        events,
      }, { headers: { Authorization: `Bearer ${token}` } });
      markUsageSynced();
    } catch (e) {
      logDebug("⚠️ Ara kayıt (sync) başarısız: " + (e.message || "bilinmeyen hata"));
    }
  }, [candidate, token]);

  // ===== Kamera anlık kare yakalama (L1'deki ile aynı desen, 4 sabit zaman noktası) =====
  const captureSnapshot = useCallback(async (reason = "auto") => {
    if (snapshotInFlightRef.current || savedSnapshotCountRef.current >= 4) return false;
    try {
      const video = videoRef.current;
      if (!video) { logDebug(`⚠️ Kare yakalama atlandı (${reason}): video elementi yok.`); return false; }
      if (video.readyState < 2 || !video.videoWidth) {
        logDebug(`⚠️ Kare yakalama atlandı (${reason}): video hazır değil (readyState=${video.readyState}, videoWidth=${video.videoWidth}).`);
        return false;
      }

      snapshotInFlightRef.current = true;
      const canvas = document.createElement("canvas");
      canvas.width = 360;
      canvas.height = Math.round(360 * (video.videoHeight / video.videoWidth)) || 270;
      const ctx = canvas.getContext("2d");
      if (!ctx) { logDebug(`⚠️ Kare yakalama atlandı (${reason}): canvas context alınamadı.`); return false; }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.76);

      const candidateId = candidate ? candidate.id : null;
      if (!candidateId) { logDebug(`⚠️ Kare yakalama atlandı (${reason}): candidate_id yok.`); return false; }

      const res = await axios.post(`${API_URL}/api/interview/snapshot`, {
        candidate_id: candidateId, image_base64: dataUrl, reason
      }, { headers: { Authorization: `Bearer ${token}` } });
      if (typeof res.data?.count === "number") savedSnapshotCountRef.current = res.data.count;
      else savedSnapshotCountRef.current = Math.min(4, savedSnapshotCountRef.current + 1);
      logDebug(`📷 Kare kaydedildi (${reason}). Toplam: ${savedSnapshotCountRef.current}/4`);
      return true;
    } catch (e) {
      logDebug(`⚠️ Kare yakalama HATASI (${reason}): ${e.response?.data?.detail || e.message || "bilinmeyen hata"}`);
      return false;
    } finally {
      snapshotInFlightRef.current = false;
    }
  }, [candidate, token]);

  const ensureSnapshot = useCallback((reason = "auto") => {
    if (savedSnapshotCountRef.current >= 4) return;
    [0, 700, 1800].forEach(delay => {
      setTimeout(() => {
        if (savedSnapshotCountRef.current < 4) captureSnapshot(reason);
      }, delay);
    });
  }, [captureSnapshot]);

  // ===== FAZ D: MİMİK ANALİZ KARELERİ — doğrulama karelerinden AYRI =====
  // 45 sn'de bir, üst sınır 24. reason='mimic_sample' ile gönderilir; backend bunları ayrı
  // kotada tutar ve panel/PDF'te GÖSTERMEZ. Kendi in-flight/sayaç ref'leri var; doğrulama
  // karesi akışına (savedSnapshotCountRef, snapshotInFlightRef) hiç dokunmaz.
  const mimicFrameCountRef = useRef(0);
  const mimicInFlightRef = useRef(false);
  // Aralık sabit değil: session yanıtındaki target_seconds'a göre (aralik = target_seconds/24),
  // alt sınır 30 sn. Böylece 24 kare mülakatın planlanan tamamına eşit dağılır.
  const [mimicIntervalMs, setMimicIntervalMs] = useState(45000);
  const captureMimicFrame = useCallback(async () => {
    if (mimicInFlightRef.current || mimicFrameCountRef.current >= 24 || finishedRef.current) return;
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) return;
    const candidateId = candidate ? candidate.id : null;
    if (!candidateId) return;
    mimicInFlightRef.current = true;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 360;
      canvas.height = Math.round(360 * (video.videoHeight / video.videoWidth)) || 270;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
      const res = await axios.post(`${API_URL}/api/interview/snapshot`, {
        candidate_id: candidateId, image_base64: dataUrl, reason: "mimic_sample",
        elapsed_ms: Math.round((elapsedRef.current || 0) * 1000),
        level: candidate ? candidate.level : null,
      }, { headers: { Authorization: `Bearer ${token}` } });
      if (typeof res.data?.count === "number") mimicFrameCountRef.current = res.data.count;
      else mimicFrameCountRef.current += 1;
    } catch (e) {
      // Mimik karesi kritik değil — sessiz geç, mülakat akışını etkileme.
    } finally {
      mimicInFlightRef.current = false;
    }
  }, [candidate, token]);

  useEffect(() => {
    if (step !== "live" || finished) return;
    const id = setInterval(() => { captureMimicFrame(); }, mimicIntervalMs);
    return () => clearInterval(id);
  }, [step, finished, captureMimicFrame, mimicIntervalMs]);

  // Sabit bir toplam süre olmadığı için (adaptif konuşma) oran yerine mutlak saniye
  // kontrol noktaları kullanılır: erken varlık doğrulaması + orta + geç + son.
  useEffect(() => {
    if (step !== "live" || finished) return;
    const checkpoints = [8, 45, 120, 240];
    checkpoints.forEach((seconds, idx) => {
      if (!snapshotTakenRef.current[idx] && elapsed >= seconds) {
        snapshotTakenRef.current[idx] = true;
        ensureSnapshot(`time_${idx + 1}`);
      }
    });
  }, [elapsed, step, finished, ensureSnapshot]);

  // Sekme kapanırken/uygulamadan çıkılırken SON bir kez, en iyi çaba ("best effort") ile
  // sendBeacon üzerinden kayıt dener. sendBeacon Authorization header koyamadığı için token
  // body içinde gönderiliyor (backend bunu ayrıca doğruluyor).
  useEffect(() => {
    const sendBeaconSync = () => {
      if (finishedRef.current || !candidate?.id || !navigator.sendBeacon) return;
      const delta = computeUsageDelta();
      const payload = JSON.stringify({
        candidate_id: candidate.id,
        transcript: currentTranscriptText(),
        duration_seconds: Math.floor(elapsedRef.current),
        answered_count: answeredCountRef.current,
        usage_delta: delta,
        events: drainRealtimeEvents(),
        token,
      });
      try {
        navigator.sendBeacon(`${API_URL}/api/realtime/sync`, new Blob([payload], { type: "application/json" }));
      } catch (e) { /* yoksay — best effort */ }
    };
    const onPageHide = () => sendBeaconSync();
    const onVisibility = () => { if (document.visibilityState === "hidden") sendBeaconSync(); };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [candidate, token]);

  const submitReport = useCallback(async (endReason) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setFinishing(true);
    // Son bir delta hesapla (son heartbeat'ten bu yana) — cleanupRealtime'dan ÖNCE, çünkü
    // response.done olayları pc/dc kapanınca artık gelmeyecek.
    const finalUsageDelta = computeUsageDelta();
    cleanupRealtime();
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    const fullTranscript = currentTranscriptText();
    try {
      const res = await axios.post(`${API_URL}/api/realtime/report`, {
        candidate_id: candidate?.id,
        transcript: fullTranscript,
        duration_seconds: Math.floor(elapsedRef.current),
        answered_count: answeredCountRef.current,
        end_reason: endReason,
        realtime_usage: finalUsageDelta,
        events: drainRealtimeEvents(),
      }, { headers: { Authorization: `Bearer ${token}` } });
      markUsageSynced();
      logDebug("Finalize/rapor tamamlandı. Skor=" + (res.data?.score ?? "-") + ", öneri=" + (res.data?.recommendation ?? "-"));
      setReportResult(res.data);
    } catch (e) {
      logDebug("⚠️ Finalize/rapor hatası: " + (e.response?.data?.detail || e.message || "bilinmeyen hata"));
      setReportResult({ score: null, recommendation: null, error: true });
    } finally {
      setFinished(true);
      setFinishing(false);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    }
  }, [candidate, token]);
  submitReportRef.current = submitReport;

  // ===== BÖLÜM 3: sesli mülakatta sistem ihlal tespiti (Interview.js deseninin uyarlaması) =====
  // Şu ana kadar sesli mülakatta HİÇBİR sistem tespiti yoktu; bu ciddi açığı kapatır.
  // WebRTC/ses transportuna dokunmaz — yalnızca sekme/kamera olaylarını backend'e bildirir.
  const violationLastTsRef = useRef(0);
  const violationGraceUntilRef = useRef(0);
  const hiddenSinceRef = useRef(null);
  const reportRealtimeViolation = useCallback(async (violationType, detail) => {
    if (finishedRef.current || !candidate?.id) return;
    try {
      const res = await axios.post(`${API_URL}/api/interview/violation`, {
        candidate_id: candidate.id, violation_type: violationType, detail,
        elapsed_seconds: Math.round(elapsedRef.current || 0),
      }, { headers: { Authorization: `Bearer ${token}` } });
      if (res.data?.terminated && !finishedRef.current) {
        logDebug(`İhlal nedeniyle sonlandırma (${violationType}); rapor üretiliyor.`);
        setCurrentQuestion("Mülakat kuralları ihlal edildiği için süreç sonlandırıldı.");
        submitReportRef.current("uygunsuz_davranis");
      } else if (res.data?.violation_count) {
        logDebug(`İhlal kaydedildi: ${violationType} (${res.data.violation_count}/3).`);
      }
    } catch (e) {
      logDebug("⚠️ İhlal bildirimi başarısız: " + (e.message || "bilinmeyen"));
    }
  }, [candidate, token]);

  useEffect(() => {
    if (step !== "live" || finished) return;
    violationGraceUntilRef.current = Date.now() + 10000; // başlangıç hoşgörüsü
    const reportOnce = () => {
      const now = Date.now();
      if (now < violationGraceUntilRef.current) return;
      if (now - violationLastTsRef.current < 1500) return; // blur+visibility tekrarı
      violationLastTsRef.current = now;
      reportRealtimeViolation("tab_switch", "Aday sesli mülakat sırasında sekme/uygulama değiştirdi");
    };
    const onVisibility = () => {
      if (document.hidden) {
        hiddenSinceRef.current = Date.now();
        reportOnce();
      } else if (hiddenSinceRef.current) {
        const awayMs = Date.now() - hiddenSinceRef.current;
        hiddenSinceRef.current = null;
        if (awayMs > 120000) {
          reportRealtimeViolation("prolonged_absence", `Aday ~${Math.round(awayMs / 1000)} sn boyunca mülakat ekranından ayrıldı`);
        }
      }
    };
    const onBlur = () => reportOnce();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
    };
  }, [step, finished, reportRealtimeViolation]);

  // ===== OpenAI Realtime WebRTC bağlantısını kur =====
  const connectRealtime = async () => {
    initialResponseSentRef.current = false;
    openingCompletedRef.current = false;
    if (openingFallbackTimerRef.current) { clearTimeout(openingFallbackTimerRef.current); openingFallbackTimerRef.current = null; }
    setConnectError("");
    setConnecting(true);
    logDebug("Bağlantı hazırlanıyor; mülakat ekranı ve sayaç ses oturumu hazır olduğunda başlayacak.");

    // AudioContext mutlaka kullanıcı tıklamasının senkron akışında oluşturulup açılır.
    // Aksi halde Chrome/Safari bağlantı doğru olsa bile fiziksel ses çıkışını askıda tutabilir.
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      remotePlaybackCtxRef.current = new Ctx();
      if (remotePlaybackCtxRef.current.state === "suspended") {
        remotePlaybackCtxRef.current.resume().catch(() => {});
      }
      logDebug("WebAudio çıkışı kullanıcı tıklamasıyla hazırlandı.");
    } catch (e) {
      logDebug("⚠️ WebAudio başlangıç hatası; HTML audio fallback kullanılacak: " + (e.message || e));
    }

    // ÖNEMLİ: Ses elemanını ve ilk play() denemesini, herhangi bir "await"ten ÖNCE
    // (yani hâlâ butona tıklama anının senkron akışı içinde) yapıyoruz — tarayıcılar
    // otomatik ses çalmayı sadece gerçek bir kullanıcı jesti anında/hemen sonrasında
    // izin veriyor.
    const audioEl = document.createElement("audio");
    audioEl.autoplay = true;
    audioEl.playsInline = true;
    audioEl.controls = false;
    audioEl.muted = false;
    audioEl.volume = 1;
    audioEl.style.display = "none";
    document.body.appendChild(audioEl);
    remoteAudioRef.current = audioEl;
    logDebug("Ses elemanı DOM'a gizli olarak eklendi.");
    // ÖNEMLİ DÜZELTME: Kaynağı (srcObject) olmayan bir <audio> elemanında play()
    // çağrısı bazı tarayıcılarda hiç çözülmeyen (resolve/reject olmayan) bir Promise
    // döndürüyor — bunu "await" etmek TÜM bağlantı akışını sonsuza kadar kilitliyordu
    // (önceki denemede tam bu yüzden "Bağlanıyor" ekranında donmuştuk). Artık
    // beklenmiyor, sadece tetiklenip unutuluyor (fire-and-forget).
    audioEl.play().then(
      () => logDebug("Ses elemanı önceden 'unlock' edildi."),
      (e) => logDebug("Ses ön-unlock denemesi (beklenen): " + e.name)
    );

    let audioPlayRetryTimer = null;
    const ensureAudioPlayback = (reason = "auto") => {
      const el = remoteAudioRef.current;
      if (!el || finishedRef.current) return;
      el.muted = Boolean(remotePlaybackSourceRef.current);
      el.volume = 1;
      el.autoplay = true;
      el.playsInline = true;
      const tryPlay = () => {
        if (!remoteAudioRef.current || finishedRef.current) return;
        remoteAudioRef.current.play()
          .then(() => {
            logDebug(`Ses otomatik oynatma aktif (${reason}). paused=${remoteAudioRef.current.paused}`);
            setConnStatus(st => ({ ...st, playback: "auto-play aktif" }));
          })
          .catch(err => {
            logDebug(`⚠️ Ses otomatik play denemesi başarısız (${reason}): ${err.name}`);
            setConnStatus(st => ({ ...st, playback: "auto-play hata: " + err.name }));
          });
      };
      tryPlay();
      if (audioPlayRetryTimer) clearTimeout(audioPlayRetryTimer);
      audioPlayRetryTimer = setTimeout(tryPlay, 250);
    };
    ensureAudioPlaybackRef.current = ensureAudioPlayback;

    audioEl.addEventListener("pause", () => {
      // Bazı tarayıcılarda kullanıcı konuşunca / response.cancel sonrası media element pause kalabiliyor.
      // AI yeniden konuşmaya başladığında tek audio elementini otomatik uyandırıyoruz.
      if (hasActiveResponseRef.current && !finishedRef.current) {
        setTimeout(() => ensureAudioPlayback("pause-auto-resume"), 120);
      }
    });

    audioEl.addEventListener("playing", () => {
      setConnStatus(st => ({ ...st, playback: "playing" }));
    });
    audioEl.addEventListener("canplay", () => ensureAudioPlayback("canplay"));
    audioEl.addEventListener("loadedmetadata", () => ensureAudioPlayback("loadedmetadata"));
    audioEl.addEventListener("ended", () => {
      // WebRTC stream normalde bitmez; yine de bazı browserlarda ended sonrası pipeline'ı uyanık tut.
      if (!finishedRef.current) setTimeout(() => ensureAudioPlayback("ended-auto-resume"), 120);
    });

    logDebug("Ses elemanı hazırlandı, devam ediliyor...");

    try {
      const sessionRes = await axios.post(`${API_URL}/api/realtime/session`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const ephemeralKey = sessionRes.data.client_secret;
      const model = sessionRes.data.model;
      coverageThresholdRef.current = sessionRes.data.coverage_threshold || 60;
      criteriaNamesRef.current = sessionRes.data.criteria_names || [];
      pricingRef.current = sessionRes.data.pricing || {};
      // FAZ D: mimik kareleri mülakatın planlanan süresine eşit dağılsın (aralik = süre/24, alt sınır 30 sn).
      if (sessionRes.data.target_seconds) {
        setMimicIntervalMs(Math.max(30, Math.round(sessionRes.data.target_seconds / 24)) * 1000);
      }
      logDebug(`Ephemeral key alındı. Model: ${model}. Key uzunluğu: ${ephemeralKey ? ephemeralKey.length : 0}`);
      if (!ephemeralKey) logDebug("⚠️ UYARI: client_secret boş geldi — backend session yanıtını kontrol et.");

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      pc.onconnectionstatechange = () => { logDebug("Peer connection durumu: " + pc.connectionState); setConnStatus(s => ({ ...s, peer: pc.connectionState })); };
      pc.oniceconnectionstatechange = () => { logDebug("ICE bağlantı durumu: " + pc.iceConnectionState); setConnStatus(s => ({ ...s, ice: pc.iceConnectionState })); };
      pc.ontrack = (e) => {
        const track = e.track;
        logDebug(`🔊 ontrack tetiklendi! kind=${track.kind}, readyState=${track.readyState}, muted=${track.muted}, streams=${e.streams.length}`);
        setConnStatus(s => ({ ...s, track: `Alındı, ilk muted=${track.muted}` }));
        // ÖNEMLİ TEŞHİS: track.muted=true başta normaldir (henüz paket akmamıştır).
        // Gerçek ses verisi gelmeye başlayınca 'unmute' olayı tetiklenmesi GEREKİR.
        // Bu olay hiç gelmezse, bağlantı kurulmuş görünse bile gerçekte hiç ses
        // paketi akmıyor demektir (media-level sorun, network/SRTP vb.).
        track.onunmute = () => { logDebug("🔊🔊 TRACK UNMUTE — gerçek ses verisi akmaya başladı!"); setConnStatus(s => ({ ...s, track: "Aktif, ses akıyor (unmuted)" })); };
        track.onmute = () => { logDebug("⚠️ Track tekrar mute oldu — ses akışı durdu."); setConnStatus(s => ({ ...s, track: "DURDU (muted)" })); };
        const stream = e.streams && e.streams[0] ? e.streams[0] : new MediaStream([track]);
        // v30 AUDIO STABILITY FIX:
        // srcObject aynıysa tekrar bağlama / load() çağırma. Browser bazı durumlarda
        // load() sonrası media elementini durdurup kullanıcıdan yeniden Play isteyebiliyor.
        if (audioEl.srcObject !== stream) {
          audioEl.srcObject = stream;
        }
        attachAnalyser(stream, remoteAnalyserRef);
        attachRemotePlayback(stream, "ontrack");
        audioEl.volume = 1;
        audioEl.autoplay = true;
        audioEl.playsInline = true;
      };

      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          sampleRate: 24000,
          channelCount: 1,
          // Chrome'a özel, dokümante edilmemiş ama gerçek ek yankı iptali bayrakları —
          // standart echoCancellation'dan daha agresif çalışabiliyor. Desteklenmeyen
          // tarayıcılarda zararsız şekilde yoksayılır.
          googEchoCancellation: true,
          googEchoCancellation2: true,
          googAutoGainControl: true,
          googNoiseSuppression: true,
          googHighpassFilter: true,
          googTypingNoiseDetection: true,
        }
      });
      logDebug("Mikrofon açıldı (gelişmiş yankı iptali ayarlarıyla).");
      micStreamRef.current = micStream;
      // Açılış tamamlanmadan mikrofonu Realtime oturumuna ses göndermeye kapat.
      // Böylece hazırlık ekranındaki nefes/ortam sesi otomatik bir "Harika" cevabı üretmez.
      micStream.getTracks().forEach(t => { t.enabled = false; });
      attachAnalyser(micStream, micAnalyserRef);
      startLevelLoop();
      // ÖNEMLİ: addTrack yerine (veya ona ek olarak) açıkça sendrecv transceiver
      // ekliyoruz — bu, SDP offer'ın "hem gönder hem al" istediğini tartışmasız
      // hale getirir. pc.ontrack hiç tetiklenmiyordu; bu, olası bir sebep.
      // GÜNCELLEME: Tek bir "sendrecv" transceiver yerine — ayrı bir addTrack (mikrofonu
      // gönder) + ayrı, özel bir "recvonly" transceiver (AI'nın sesini almak için) kullanılıyor.
      // Bu, OpenAI Realtime WebRTC dokümantasyonunda önerilen desene daha yakın.
      pc.addTrack(micStream.getTracks()[0], micStream);
      pc.addTransceiver("audio", { direction: "recvonly" });
      logDebug("Mikrofon track eklendi + ayrı recvonly transceiver oluşturuldu.");

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      const sendInitialOpening = (source = "session.updated") => {
        if (initialResponseSentRef.current || dc.readyState !== "open") return;
        initialResponseSentRef.current = true;
        if (openingFallbackTimerRef.current) { clearTimeout(openingFallbackTimerRef.current); openingFallbackTimerRef.current = null; }
        // BÖLÜM 1.4: SABİT AÇILIŞ CÜMLESİ YOK. Modeli, talimatındaki "ADAYI OKU, UYUM SAĞLA"
        // ilkesine göre kendi açılışını üretmeye tetikliyoruz.
        const position = candidate?.position || "başvurduğunuz pozisyon";
        dc.send(JSON.stringify({
          type: "response.create",
          response: {
            input: [],
            instructions: `Görüşmeyi şimdi başlat. ${position} pozisyonu için bir mülakat. Adayın tonunu henüz duymadın — kısa, sıcak ve doğal bir karşılamayla aç ve adaya kendini/deneyimini kısaca tanıtmasını iste. SABİT KALIP CÜMLE KULLANMA, ezbere "Hoş geldiniz ... Bey/Hanım" gibi bir şablon okuma; doğal konuş.`
          }
        }));
        logDebug(`İlk açılış tetiklendi (${source}) — model kendi karşılamasını üretir.`);
      };

      sendInitialOpeningRef.current = sendInitialOpening;

      dc.onopen = () => {
        logDebug("Data channel açıldı (oai-events).");
        // Data channel açıldıysa bağlantı gerçek anlamda hazırdır. UI tek bir session.updated
        // olayına bağlı kalmamalı; hemen canlı ekrana geçer. Mikrofon açılış bitene kadar kapalıdır.
        setConnecting(false);
        setStep("live");
        if (!startTsRef.current) startInterviewClock();
        logDebug("Data channel hazır; canlı ekran ve sayaç başlatıldı.");
        // session.updated bazı bağlantılarda gecikebilir veya hiç görünmeyebilir.
        // 1.5 saniye içinde gelmezse açılışı güvenli biçimde bir kez gönder.
        openingFallbackTimerRef.current = setTimeout(() => sendInitialOpening("fallback"), 250);
        // Güvenlik ağı: session oluşturulurken gönderdiğimiz ayarları bağlantı açıldıktan
        // sonra tekrar netleştiriyoruz (bazı istemcilerde ilk ayar tam uygulanmayabiliyor).
        dc.send(JSON.stringify({
          type: "session.update",
          session: {
            type: "realtime",
            audio: {
              output: { voice: REALTIME_VOICE },
              input: {
                transcription: { model: "whisper-1" },
                turn_detection: {
                  // v34: backend session ayarıyla tutarlı olsun diye burası da semantic_vad'e
                  // güncellendi — OpenAI Realtime API'nin resmi desteklediği bir mod (bkz.
                  // platform.openai.com/docs/guides/realtime-vad). Sabit sessizlik süresi yerine
                  // adayın cümlesinin anlam olarak bitip bitmediğine göre karar verir.
                  type: "semantic_vad",
                  eagerness: "high",
                  create_response: true,
                  interrupt_response: false
                }
              }
            }
          }
        }));

        // İlk response, session.update uygulanmadan gönderilirse 0-token boş response oluşabiliyor.
        // Bu yüzden ilk soruyu session.updated olayından sonra yalnızca bir kez gönderiyoruz.
        logDebug("Session ayarları gönderildi; session.updated bekleniyor.");

        // Ara kayıt: submitReport hiç tetiklenmese bile transkript/usage kaybolmasın diye ~25sn'de bir.
        heartbeatRef.current = setInterval(() => { syncProgress(); }, 25000);
        setPhase("thinking"); phaseRef.current = "thinking";
      };
      dc.onerror = (e) => logDebug("⚠️ Data channel hatası: " + JSON.stringify(e.error || e));
      dc.onclose = () => logDebug("Data channel kapandı.");

      dc.onmessage = (e) => {
        let evt;
        try { evt = JSON.parse(e.data); } catch (err) { return; }
        if (evt.type && evt.type !== "response.audio_transcript.delta" && evt.type !== "response.audio.delta" && evt.type !== "response.output_audio_transcript.delta" && evt.type !== "response.output_audio.delta") {
          logDebug("Olay: " + evt.type);
        }
        if (evt.type === "error") {
          logDebug("⚠️ HATA DETAYI: " + JSON.stringify(evt.error || evt).slice(0, 400));
        }
        handleRealtimeEvent(evt, pc);
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      logDebug("SDP offer oluşturuldu, gönderiliyor...");

      const sdpResp = await fetch(`https://api.openai.com/v1/realtime/calls?model=${model}`, {
        method: "POST",
        body: offer.sdp,
        headers: { "Authorization": `Bearer ${ephemeralKey}`, "Content-Type": "application/sdp" }
      });
      logDebug("SDP cevabı durumu: " + sdpResp.status);
      setConnStatus(s => ({ ...s, sdp: String(sdpResp.status) }));
      if (!sdpResp.ok) {
        const errBody = await sdpResp.text();
        logDebug("⚠️ SDP HATA gövdesi: " + errBody.slice(0, 300));
        throw new Error("SDP negotiation failed: " + sdpResp.status);
      }
      const answerSdp = await sdpResp.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      logDebug("Bağlantı tamamlandı, remote description ayarlandı.");
    } catch (e) {
      logDebug("⚠️ GENEL HATA: " + (e.message || e));
      console.error(e);
      setConnectError("Sesli mülakat bağlantısı kurulamadı: " + (e.message || "bilinmeyen hata"));
      setConnecting(false);
      setStep("ready");
      cleanupRealtime();
    }
  };

  const handleEndInterviewRequest = (reasonRaw, criteriaCoverage) => {
    const reason = ["aday_talebi", "uygunsuz_davranis"].includes(reasonRaw) ? reasonRaw : "tamamlandı";
    if (reason !== "tamamlandı") { submitReport(reason); return; }

    // Kriter-bazlı bitiş kontrolü: eski "en az 6 ham cevap" sayacı yerine, AI'ın her kriter
    // için bildirdiği kapsanma/netlik yüzdesi kontrol edilir. Coverage hiç gelmediyse (AI
    // parametreyi atladıysa) eski ham cevap sayısını son bir güvenlik ağı olarak kullan.
    const names = criteriaNamesRef.current;
    const threshold = coverageThresholdRef.current;
    let belowThresholdCount = 0;
    let checked = 0;
    if (criteriaCoverage && typeof criteriaCoverage === "object" && names.length > 0) {
      names.forEach((n) => {
        const v = Number(criteriaCoverage[n]);
        if (!Number.isNaN(v)) {
          checked += 1;
          if (v < threshold) belowThresholdCount += 1;
        }
      });
    }
    const majorityBelow = checked > 0 && belowThresholdCount > Math.floor(checked / 2);
    const noCoverageDataFallback = checked === 0 && answeredCountRef.current < 5;

    if (majorityBelow || noCoverageDataFallback) {
      logDebug(`⚠️ Erken end_interview engellendi. below=${belowThresholdCount}/${checked}, answered_count=${answeredCountRef.current}`);
      try {
        dcRef.current && dcRef.current.send(JSON.stringify({
          type: "response.create",
          response: {
            instructions: "Henüz yeterli değerlendirme verisi yok. Mülakata devam et. Zayıf kalan kriter(ler)e dönüp kısa bir takip sorusu sor; adaydan somut örnek, sonuç veya pozisyonla ilişkili deneyim iste."
          }
        }));
      } catch (err) {}
      return;
    }
    submitReport(reason);
  };

  // ===== Realtime data channel olaylarını işle: barge-in, transcript, end_interview =====
  const handleRealtimeEvent = (evt) => {
    switch (evt.type) {
      case "session.created":
        // Faz D1: session.created.session.expires_at izlenir (platform 60 dk sınırına ne kadar
        // kaldığının gözlemlenebilirliği için) — bağlantı kurulumuna dokunmuyor, sadece kaydediyor.
        pushRealtimeEvent("session.created", { expires_at: evt.session?.expires_at });
        logDebug(`Session oluşturuldu. expires_at=${evt.session?.expires_at || "yok"}`);
        break;
      // Yalnızca client'ın kendi gönderdiği conversation.item.truncate'e karşılık gelir (barge-in
      // kesmesi) — otomatik bağlam-penceresi budaması için AYRI bir bildirim yoktur (bkz. Faz D1
      // raporu). Yine de gerçekleşirse savunma amaçlı kaydedilir.
      case "conversation.item.truncated":
        pushRealtimeEvent("conversation.item.truncated", { audio_end_ms: evt.audio_end_ms, item_id: evt.item_id, content_index: evt.content_index });
        break;
      case "input_audio_buffer.speech_started": {
        pushRealtimeEvent("input_audio_buffer.speech_started", { audio_start_ms: evt.audio_start_ms, item_id: evt.item_id });
        candidateSpeechActiveRef.current = true;
        setPhase("listening"); phaseRef.current = "listening";
        // TV, masa, nefes veya kısa çevre sesi AI'ı kesmesin. Gerçek araya giriş için
        // server konuşma algısının sürmesi + mikrofon seviyesinin anlamlı kalması birlikte aranır.
        if (bargeInConfirmTimerRef.current) clearTimeout(bargeInConfirmTimerRef.current);
        bargeInConfirmTimerRef.current = setTimeout(() => {
          const meaningfulMic = micRmsRef.current >= 0.018;
          if (!candidateSpeechActiveRef.current || !hasActiveResponseRef.current || !meaningfulMic || dcRef.current?.readyState !== "open") {
            logDebug(`Kısa/anlamsız ses yok sayıldı. micRms=${micRmsRef.current.toFixed(4)}`);
            return;
          }
          try {
            dcRef.current.send(JSON.stringify({ type: "response.cancel" }));
            dcRef.current.send(JSON.stringify({ type: "output_audio_buffer.clear" }));
            logDebug(`Gerçek araya giriş doğrulandı; AI susturuldu. micRms=${micRmsRef.current.toFixed(4)}`);
            // FAZ D: doğrulanmış söz kesme — ses metrikleri için (mevcut buffer → sync/report).
            pushRealtimeEvent("barge_in_confirmed", { mic_rms: Number(micRmsRef.current.toFixed(4)) });
          } catch (err) {
            logDebug("⚠️ Doğrulanmış araya giriş durdurma hatası: " + (err.message || err));
          }
        }, 800);
        break;
      }
      case "input_audio_buffer.speech_stopped":
        pushRealtimeEvent("input_audio_buffer.speech_stopped", { audio_end_ms: evt.audio_end_ms, item_id: evt.item_id });
        candidateSpeechActiveRef.current = false;
        if (bargeInConfirmTimerRef.current) { clearTimeout(bargeInConfirmTimerRef.current); bargeInConfirmTimerRef.current = null; }
        // semantic_vad adayın cümlesinin anlam olarak bitip bitmediğine göre bu olayı tetikler.
        setPhase("thinking"); phaseRef.current = "thinking";
        break;
      case "session.updated":
        if (dcRef.current?.readyState === "open") {
          // UI geçişi dc.onopen ile yapılır; burada yalnızca açılışın bir kez gönderilmesini sağla.
          sendInitialOpeningRef.current("session.updated");
        }
        break;
      case "response.created":
        hasActiveResponseRef.current = true;
        // FAZ D: AI düşünme süresi metriği (speech_stopped -> response.created).
        pushRealtimeEvent("response.created", {});
        setPhase("speaking"); phaseRef.current = "speaking";
        ensureAudioPlaybackRef.current("response.created");
        break;
      case "output_audio_buffer.started":
        // Son güvenlik ağı: ses başladıysa kullanıcı kesinlikle hazırlık ekranında kalmamalı.
        setConnecting(false);
        setStep("live");
        if (!startTsRef.current) startInterviewClock();
        // v32 BARGE-IN FIX:
        // Mikrofonu AI konuşurken kapatmıyoruz. Böylece aday araya girerse
        // input_audio_buffer.speech_started yakalanır ve aktif cevap response.cancel ile kesilir.
        // Yankı ihtimali echoCancellation/noiseSuppression + tek audio pipeline ile azaltılır.
        setPhase("speaking"); phaseRef.current = "speaking";
        ensureAudioPlaybackRef.current("output_audio_buffer.started");
        break;
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared":
        break;
      case "response.done":
        hasActiveResponseRef.current = false;
        pushRealtimeEvent("response.done", { usage: evt.response?.usage || evt.usage || {} });
        addRealtimeUsage(evt.response?.usage || evt.usage);
        setPhase("thinking"); phaseRef.current = "thinking";
        // İlk açılış tamamlanınca aday mikrofonunu aç. Açılıştan önce ortam sesi modele gitmez.
        if (initialResponseSentRef.current && !openingCompletedRef.current) {
          openingCompletedRef.current = true;
          if (micStreamRef.current) micStreamRef.current.getTracks().forEach(t => { t.enabled = true; });
          setPhase("listening"); phaseRef.current = "listening";
          logDebug("Açılış tamamlandı; aday mikrofonu şimdi etkinleştirildi.");
        } else if (micStreamRef.current) {
          micStreamRef.current.getTracks().forEach(t => { t.enabled = true; });
        }
        break;
      case "conversation.item.input_audio_transcription.completed":
        // Adayın konuştuğu turun yazıya çevrilmiş hali (rapor/transkript için).
        // FAZ D: aday turu sinyali — ses metrikleri (tur eşleştirme / yanıt gecikmesi).
        pushRealtimeEvent("conversation.item.input_audio_transcription.completed", { has_text: !!evt.transcript });
        if (evt.transcript) {
          appendTranscript("aday", evt.transcript);
          answeredCountRef.current += 1;
        }
        break;
      case "response.audio_transcript.delta":
      case "response.output_audio_transcript.delta":
        assistantDeltaRef.current += evt.delta || "";
        break;
      case "response.audio_transcript.done":
      case "response.output_audio_transcript.done": {
        const spoken = assistantDeltaRef.current.trim();
        appendTranscript("mülakatçı", spoken);
        assistantDeltaRef.current = "";
        // FAZ D: AI konuşma bitişi — aday yanıt gecikmesi metriği (bu olay -> sonraki speech_started).
        pushRealtimeEvent("response.audio_transcript.done", {});
        // Ekranda yalnızca adaydan cevap bekleyen son soruyu göster.
        const questionMatches = spoken.match(/[^.!?]*\?/g);
        const lastQuestion = questionMatches?.length ? questionMatches[questionMatches.length - 1].trim() : "";
        if (lastQuestion) setCurrentQuestion(lastQuestion);
        // Model kapanış cümlesini söylediği halde tool çağrısını atlayabilirse oturum açık
        // kalmasın. Tool gelirse timer temizlenir; gelmezse güvenli biçimde finalize edilir.
        if (/mülakat(ımız|ı)? (burada )?(sona er|bit)|görüşme(miz)? (burada )?(sona er|bit)/i.test(spoken)) {
          if (closingFallbackTimerRef.current) clearTimeout(closingFallbackTimerRef.current);
          closingFallbackTimerRef.current = setTimeout(() => {
            if (!finishedRef.current) submitReport("tamamlandı");
          }, 1800);
        }
        break;
      }
      case "response.function_call_arguments.done":
        if (evt.name === "end_interview") {
          // Aynı tool call'ı response.output_item.done da bildiriyor — call_id ile dedupe et,
          // aksi halde (özellikle kapsanma-altı erken-engelleme yolunda) "devam et" komutu
          // AI'a 2 kez gönderilip gereksiz ekstra bir ses cevabına (=fazladan maliyet) yol açıyordu.
          const callId = evt.call_id || evt.item_id || "single";
          if (endInterviewHandledRef.current === callId) break;
          endInterviewHandledRef.current = callId;
          let reason = "tamamlandı";
          let coverage = null;
          try {
            const parsed = JSON.parse(evt.arguments || "{}");
            reason = parsed.reason || "tamamlandı";
            coverage = parsed.criteria_coverage || null;
            if (closingFallbackTimerRef.current) { clearTimeout(closingFallbackTimerRef.current); closingFallbackTimerRef.current = null; }
          } catch (err) {}
          handleEndInterviewRequest(reason, coverage);
        } else if (evt.name === "note_voice_observation") {
          recordVoiceObservation(evt.call_id || evt.item_id, evt.arguments);
        }
        break;
      case "response.output_item.done":
        if (evt.item && evt.item.type === "function_call" && evt.item.name === "end_interview") {
          const callId = evt.item.call_id || evt.item.id || "single";
          if (endInterviewHandledRef.current === callId) break;
          endInterviewHandledRef.current = callId;
          let reason = "tamamlandı";
          let coverage = null;
          try {
            const parsed = JSON.parse(evt.item.arguments || "{}");
            reason = parsed.reason || "tamamlandı";
            coverage = parsed.criteria_coverage || null;
            if (closingFallbackTimerRef.current) { clearTimeout(closingFallbackTimerRef.current); closingFallbackTimerRef.current = null; }
          } catch (err) {}
          handleEndInterviewRequest(reason, coverage);
        } else if (evt.item && evt.item.type === "function_call" && evt.item.name === "note_voice_observation") {
          recordVoiceObservation(evt.item.call_id || evt.item.id, evt.item.arguments);
        }
        break;
      default:
        break;
    }
  };

  const handleManualFinish = () => submitReport("aday_talebi");

  // ========================= RENDER =========================

  if (step === "camera") {
    return (
      <div style={{ minHeight: "100vh", background: "#fafbfc", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif" }}>
        <div style={{ width: "100%", maxWidth: 420, background: "#fff", border: "1px solid #eef1f4", borderRadius: 20, padding: 40, boxShadow: "0 1px 3px rgba(15,23,42,0.04)", textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 10 }}>MedeX SMO</div>
          <div style={{ fontSize: 19, fontWeight: 600, color: "#0f172a", marginBottom: 12 }}>Sesli Mülakata Hoş Geldiniz</div>
          <div style={{ color: "#64748b", fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
            Bu mülakat tamamen sesli yürütülecektir. Kamera erişimi doğrulama amacıyla gereklidir.
          </div>
          {cameraError && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 16 }}>{cameraError}</div>}
          <button onClick={requestCamera} style={{ width: "100%", background: "#0f172a", color: "#fff", border: "none", borderRadius: 10, padding: "13px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Kameramı Etkinleştir
          </button>
        </div>
      </div>
    );
  }

  if (step === "cv") {
    return (
      <div style={{ minHeight: "100vh", background: "#fafbfc", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif" }}>
        <div style={{ width: "100%", maxWidth: 420, background: "#fff", border: "1px solid #eef1f4", borderRadius: 20, padding: 40, boxShadow: "0 1px 3px rgba(15,23,42,0.04)", textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: "#0f172a", marginBottom: 8 }}>CV Yükleme (Zorunlu)</div>
          <div style={{ color: "#64748b", fontSize: 13, marginBottom: 20 }}>
            Bu seviyede CV yüklemeden mülakata başlanamaz.
          </div>
          <video ref={attachVideoRef} autoPlay muted playsInline style={{ width: 120, borderRadius: 12, marginBottom: 20, transform: "scaleX(-1)", border: "1px solid #eef1f4" }} />
          <input type="file" accept=".pdf,.docx" onChange={e => setCvFile(e.target.files[0] || null)} style={{ marginBottom: 20, width: "100%", fontSize: 13 }} />
          {cvError && <div style={{ color: "#dc2626", fontSize: 12, marginBottom: 14 }}>{cvError}</div>}
          <button onClick={uploadCV} disabled={!cvFile || cvUploading}
            style={{ width: "100%", background: cvFile && !cvUploading ? "#0f172a" : "#f1f5f9", color: cvFile && !cvUploading ? "#fff" : "#94a3b8", border: "none", borderRadius: 10, padding: "13px", fontSize: 14, fontWeight: 600, cursor: cvFile && !cvUploading ? "pointer" : "not-allowed" }}>
            {cvUploading ? "Yükleniyor..." : "Yükle ve Devam Et"}
          </button>
        </div>
      </div>
    );
  }

  if (step === "ready") {
    return (
      <div style={{ minHeight: "100vh", background: "#fafbfc", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif" }}>
        <div style={{ width: "100%", maxWidth: 460, background: "#fff", border: "1px solid #eef1f4", borderRadius: 20, padding: 40, boxShadow: "0 1px 3px rgba(15,23,42,0.04)", textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: "#0f172a", marginBottom: 16 }}>Mülakata Başlamadan Önce</div>
          <div style={{ color: "#64748b", fontSize: 14, lineHeight: 1.7, marginBottom: 26, textAlign: "left" }}>
            Bu mülakat sesli ve karşılıklıdır — yazı kutusu yoktur. Mülakatçı sorularını sesli soracak,
            siz doğal şekilde cevap vereceksiniz. Konuşurken araya girebilirsiniz; sistem sizi duyduğunda
            AI konuşmasını durduracaktır. Bitirmek istediğinizde "Mülakatı Bitir" butonunu kullanabilirsiniz.
          </div>
          {connectError && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 16 }}>{connectError}</div>}
          <button onClick={connectRealtime} disabled={connecting} style={{ width: "100%", background: connecting ? "#475569" : "#0f172a", color: "#fff", border: "none", borderRadius: 10, padding: "13px", fontSize: 14, fontWeight: 600, cursor: connecting ? "wait" : "pointer" }}>
            {connecting ? "Bağlantı hazırlanıyor..." : "Mikrofonu Etkinleştir ve Başla"}
          </button>
        </div>
      </div>
    );
  }

  // step === "live" (bağlanıyor + canlı görüşme + finished ekranı hepsi burada)
  return (
    <div style={{ minHeight: "100vh", background: "#fafbfc", display: "flex", flexDirection: "column", alignItems: "center", padding: 24, fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif" }}>
      <style>{`
        @keyframes medex-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
      `}</style>
      <div style={{ width: "100%", maxWidth: 560, display: "flex", flexDirection: "column", gap: 14, marginTop: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 4px 8px" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 3 }}>MedeX SMO</div>
            <div style={{ color: "#0f172a", fontSize: 16, fontWeight: 600 }}>{candidate?.name}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* BUG FIX: video elementi önceden sadece "cv" adımında vardı, "live" adımına
                geçilince DOM'dan kalkıyor ve videoRef.current null kalıyordu — bu yüzden
                kamera karesi hiç yakalanamıyordu. Küçük bir önizleme olarak burada da tutuyoruz. */}
            <video ref={attachVideoRef} autoPlay muted playsInline
              style={{ width: 54, height: 54, borderRadius: 10, objectFit: "cover", transform: "scaleX(-1)", border: "1px solid #eef1f4" }} />
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 3 }}>Süre</div>
              <div style={{ textAlign: "right" }}>
                  <div style={{ color: "#0f172a", fontWeight: 600, fontSize: 16, fontVariantNumeric: "tabular-nums" }}>{formatTime(elapsed)}</div>
                  <div style={{ color: "#64748b", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>Tahmini ~${estimatedCost.toFixed(3)}</div>
                </div>
            </div>
          </div>
        </div>

        {!finished && (
          <div style={{ background: "#ffffff", border: "1px solid #eef1f4", borderRadius: 20, padding: "56px 40px", boxShadow: "0 1px 3px rgba(15,23,42,0.04)", display: "flex", flexDirection: "column", alignItems: "center", gap: 32 }}>
            <VoiceOrb phase={phase} level={level} />
            {currentQuestion && (
              <div style={{ width: "100%", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 18px", color: "#0f172a", fontSize: 16, lineHeight: 1.55, textAlign: "center" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 7 }}>Mülakatçı sorusu</div>
                {currentQuestion}
              </div>
            )}
            <button onClick={handleManualFinish} disabled={finishing}
              style={{ background: "transparent", color: "#94a3b8", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 22px", fontSize: 13, fontWeight: 500, cursor: finishing ? "not-allowed" : "pointer", transition: "all 0.15s ease" }}>
              {finishing ? "Sonlandırılıyor..." : "Mülakatı Bitir"}
            </button>
          </div>
        )}

        {debugLog.length > 0 && (
          <div style={{ background: "#0f172a", borderRadius: 12, padding: 14, maxHeight: 220, overflowY: "auto", fontFamily: "monospace", fontSize: 11 }}>
            <div style={{ color: "#64748b", marginBottom: 6, fontWeight: 700 }}>Bağlantı Teşhis Kaydı (geliştirici için)</div>
            <div style={{ color: "#e2e8f0", marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #334155" }}>
              SDP: {connStatus.sdp} | ICE: {connStatus.ice} | Peer: {connStatus.peer} | Ses Track: {connStatus.track} | Playback: {connStatus.playback}
            </div>
            {debugLog.map((line, i) => (
              <div key={i} style={{ color: line.includes("⚠️") ? "#fbbf24" : line.includes("🔊") ? "#4ade80" : "#94a3b8", marginBottom: 2 }}>{line}</div>
            ))}
          </div>
        )}

        {finished && (
          <div style={{ background: "#ffffff", border: "1px solid #eef1f4", borderRadius: 20, padding: 40, boxShadow: "0 1px 3px rgba(15,23,42,0.04)", textAlign: "center" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <span style={{ fontSize: 22 }}>✓</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#0f172a", marginBottom: 8 }}>Mülakatınız Tamamlandı</div>
            <div style={{ color: "#64748b", lineHeight: 1.6, fontSize: 14 }}>
              {/* KAPANIŞ SIRASI: kapanış konuşmasını mülakatçı sesli yaptı; burada aday bekletilmeden
                  bitiş ekranını görür ve rapor arkada üretilir. Adaya ham hata/teknik metin gösterilmez. */}
              {reportResult?.error
                ? "Teşekkür ederiz, mülakatınız tamamlandı. Raporunuz hazırlanırken bir sorun oluştu; ekibimiz durumu görecek ve gerekirse sizinle iletişime geçecektir. Bu ekranı artık kapatabilirsiniz."
                : reportResult?.processing
                  ? "Teşekkür ederiz, mülakatınız tamamlandı. Raporunuz hazırlanıyor; bu ekranı artık kapatabilirsiniz. Değerlendirmeniz hazır olduğunda insan kaynakları ekibimiz sizinle iletişime geçecektir."
                  : "Değerlendirmeniz insan kaynakları ekibimize iletildi. En kısa sürede sizinle iletişime geçeceğiz."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
