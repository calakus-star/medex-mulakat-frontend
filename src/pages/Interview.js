import { useState, useEffect, useRef, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API_URL } from "../App";
import { colors } from "../components/Layout";

const formatTime = (s) => {
  const safe = Math.max(0, s || 0);
  return `${Math.floor(safe / 60)}:${(safe % 60).toString().padStart(2, "0")}`;
};


const CameraPreview = memo(function CameraPreview({ attachVideoRef }) {
  return (
    <div className="camera-preview" style={{ position: "relative", borderRadius: 8, overflow: "hidden", border: "2px solid #ef4444", background: "#0f172a", width: "100%", height: 82 }}>
      <video ref={attachVideoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", transform: "scaleX(-1)", background: "#0f172a" }} />
      <div style={{ position: "absolute", top: 4, left: 4, display: "flex", alignItems: "center", gap: 4, background: "rgba(0,0,0,0.6)", borderRadius: 4, padding: "2px 6px" }}>
        <div style={{ width: 6, height: 6, background: "#ef4444", borderRadius: "50%" }} />
        <span style={{ color: "#fff", fontSize: 9, fontWeight: 700 }}>KAYIT</span>
      </div>
    </div>
  );
}, () => true);

const QuestionTimer = memo(function QuestionTimer({ secondsLeft }) {
  return (
    <div style={{ textAlign: "center", marginTop: 8, background: colors.white, borderRadius: 8, padding: 8, minHeight: 54 }}>
      <div style={{ fontSize: 9, color: colors.slate, fontWeight: 600 }}>SORU SÜRESİ</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: colors.navy, fontVariantNumeric: "tabular-nums" }}>
        {formatTime(secondsLeft)}
      </div>
    </div>
  );
});

export default function Interview() {
  const navigate = useNavigate();
  const token = localStorage.getItem("candidate_token");

  // ---- Adım kontrolü: camera -> cv -> interview ----
  const [step, setStep] = useState("camera"); // camera | cv | interview
  const [candidate, setCandidate] = useState(null);

  // ---- Kamera ----
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef(null);

  // Callback ref: <video> elementi DOM'a her takıldığında (mount olduğunda)
  // mevcut kamera akışı varsa hemen bağlar. useEffect+dependency yöntemine göre
  // React'in render sıralamasından bağımsız çalıştığı için daha güvenilirdir.
  const streamRef = useRef(null);
  const attachVideoRef = useCallback((node) => {
    videoRef.current = node;
    if (node && streamRef.current && node.srcObject !== streamRef.current) {
      node.srcObject = streamRef.current;
    }
  }, []);

  // ---- CV ----
  const [cvFile, setCvFile] = useState(null);
  const [cvUploading, setCvUploading] = useState(false);
  const [cvError, setCvError] = useState("");

  // ---- Mülakat ----
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [terminated, setTerminated] = useState(false);
  const [reportProcessing, setReportProcessing] = useState(false); // rapor arkada üretiliyor mu
  const [score, setScore] = useState(null);
  const [violationWarning, setViolationWarning] = useState("");

  // ---- Ön bilgi ekranı: mülakat başlamadan önce sabit açıklama metni ----
  const [introText, setIntroText] = useState("");
  const [introConfirmed, setIntroConfirmed] = useState(false);

  // ---- Sesli mod: soruyu tarayıcı TTS ile okuma + mikrofonla dikte (tarayıcı STT) ----
  // Not: gerçek bir sesli görüşme değil — tarayıcının Web Speech API'si kullanılıyor.
  // Chrome'da iyi çalışır, Safari/Firefox'ta destek tutarsız olabilir; desteklenmiyorsa
  // ilgili buton gizlenir, yazarak devam edilir.
  const speechSynthSupported = typeof window !== "undefined" && "speechSynthesis" in window;
  const SpeechRecognitionCtor = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  const speechLangCode = candidate && candidate.interview_language === "en" ? "en-US" : candidate && candidate.interview_language === "de" ? "de-DE" : "tr-TR";
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const spokenIndexRef = useRef(-1);

  // ===== OpenAI (Whisper STT + TTS) hibrit sesli mod =====
  // Backend'de OPENAI_API_KEY tanımlıysa bu yol kullanılır (daha güvenilir, Safari dahil
  // her cihazda çalışır, Türkçe tanıma kalitesi daha iyi). Herhangi bir çağrı başarısız
  // olursa otomatik olarak tarayıcı tabanlı (Web Speech API) sesli moda düşülür.
  const useOpenAIVoiceRef = useRef(true);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const openAIAudioRef = useRef(null);
  const recordingModeRef = useRef("browser"); // "openai" | "browser" — o an hangi kayıt yolunun aktif olduğu
  const hasSpokenInRecordingRef = useRef(false); // bu kayıtta gerçekten sesli algılama oldu mu (Whisper halüsinasyonunu önlemek için)

  // ===== TAM SESLİ MOD (Level 2-3): yazı kutusu tamamen kalkar, akış tümüyle
  // sesli işler — AI soruyu sesli sorar, mikrofon otomatik açılır, cevap metne
  // çevrilip onaylandıktan sonra otomatik gönderilir. Tarayıcı TTS+STT'nin
  // ikisini de desteklemiyorsa (Safari/Firefox gibi), güvenlik amacıyla normal
  // yazı moduna otomatik düşülür — aksi halde aday mikrofonsuz kilitli kalır.
  const mediaRecorderSupported = typeof window !== "undefined" && !!window.MediaRecorder && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  // OpenAI yolu (Whisper+TTS) çalışırsa tarayıcının kendi TTS/STT desteği şart değil —
  // bu yüzden en azından biri (tarayıcı ikilisi TAM olsun YA DA MediaRecorder + Audio oynatma) yeterli.
  const voiceCapable = (speechSynthSupported && !!SpeechRecognitionCtor) || mediaRecorderSupported;
  const [forceTextMode, setForceTextMode] = useState(false);
  const voiceModeActive = voiceCapable && candidate && candidate.level >= 2 && !forceTextMode;
  const [voicePhase, setVoicePhase] = useState("idle"); // idle | speaking | listening | confirm | error
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const consecutiveVoiceFailuresRef = useRef(0);
  const MAX_CONSECUTIVE_VOICE_FAILURES = 2;
  // Art arda birkaç ses denemesi başarısız olursa (duyulamadı, Whisper hatası vb.),
  // adayı sonsuza kadar mikrofonla uğraştırmak yerine otomatik yazı moduna düşürür.
  const markVoiceFailure = () => {
    consecutiveVoiceFailuresRef.current += 1;
    if (consecutiveVoiceFailuresRef.current >= MAX_CONSECUTIVE_VOICE_FAILURES) {
      setForceTextMode(true);
      try { window.speechSynthesis.cancel(); } catch (e) { /* yoksay */ }
    } else {
      setVoicePhase("error");
    }
  };
  const markVoiceSuccess = () => { consecutiveVoiceFailuresRef.current = 0; };

  // ---- Süre (saniye) ----
  const [totalSecondsLeft, setTotalSecondsLeft] = useState(0);
  const [questionSecondsLeft, setQuestionSecondsLeft] = useState(0);
  const totalElapsedRef = useRef(0);
  const totalDurationRef = useRef(0);
  const snapshotTakenRef = useRef([false, false, false, false]); // güvenlik için ek zaman noktaları
  const savedSnapshotCountRef = useRef(0);
  const snapshotInFlightRef = useRef(false);
  const autoSentForQuestionRef = useRef(false);
  const graceGrantedRef = useRef(false); // süre dolunca direkt yanıtsız saymadan önce 1 kez ek süre + uyarı verir
  const [timeoutNudge, setTimeoutNudge] = useState("");

  // ---- Stale closure önleme: en güncel state'i ref'te tut ----
  const stateRef = useRef({ messages: [], input: "", loading: false, finished: false, candidate: null });
  useEffect(() => {
    stateRef.current = { messages, input, loading, finished, candidate };
  }, [messages, input, loading, finished, candidate]);

  const bottomRef = useRef(null);

  // ===== Mount: token kontrolü, candidate bilgisi =====
  useEffect(() => {
    if (!token) { navigate("/mulakat"); return; }
    const info = localStorage.getItem("candidate_info");
    if (info) {
      try {
        const parsed = JSON.parse(info);
        setCandidate(parsed);
        if (parsed && parsed.level >= 2) setAutoSpeak(true);
      } catch (e) { /* ignore */ }
    }
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, [navigate, token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ===== Kamera izni =====
  const requestCamera = async () => {
    setCameraError("");

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError("Tarayıcınız kamera erişimini desteklemiyor. Lütfen güncel bir Chrome, Edge veya Safari kullanın ve sitenin https (güvenli) bağlantı ile açıldığından emin olun.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      // Track'lerin gerçekten canlı olduğunu doğrula
      if (!stream || stream.getVideoTracks().length === 0) {
        setCameraError("Kamera akışı alınamadı. Lütfen kameranızın başka bir uygulama tarafından kullanılmadığından emin olup tekrar deneyin.");
        return;
      }
      streamRef.current = stream;
      setStep("cv");
    } catch (e) {
      if (e && e.name === "NotFoundError") {
        setCameraError("Cihazınızda kamera bulunamadı. Mülakata kamera bulunan bir cihazdan giriş yapmanız gerekmektedir.");
      } else if (e && e.name === "NotAllowedError") {
        setCameraError("Kamera izni reddedildi. Mülakata başlamak için tarayıcı ayarlarından kamera iznini vermeniz gerekmektedir.");
      } else {
        setCameraError("Kamera izni verilemedi. Lütfen tarayıcı ayarlarınızı kontrol edip tekrar deneyin.");
      }
    }
  };

  // Yedek güvenlik: callback ref ana mekanizma olsa da, bazı durumlarda
  // (ör. StrictMode çift render) video elementi stream'siz kalabilir, burada tazelenir
  useEffect(() => {
    if (step === "interview" && streamRef.current && videoRef.current && !videoRef.current.srcObject) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [step]);

  // Kamera stream'i beklenmedik şekilde sona ererse (kullanıcı izni geri çekerse,
  // başka bir uygulama kamerayı ele geçirirse vb.) kullanıcıyı bilgilendir
  useEffect(() => {
    if (step !== "interview" || !streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    const handleEnded = () => {
      setCameraError("Kamera bağlantısı kesildi. Mülakat devam ediyor ancak kamera görüntüsü artık alınamıyor.");
      // BÖLÜM 3: kamera kapanması bir ihlal kaydıdır (tek başına sonlandırmaz).
      if (reportViolationRef.current) reportViolationRef.current("camera_off", "Kamera video track'i 'ended' durumuna geçti");
    };
    track.addEventListener("ended", handleEnded);
    return () => track.removeEventListener("ended", handleEnded);
  }, [step]);

  // ===== Kamera anlık kare yakalama (4 sabit nokta: %20, %45, %70, %90) =====
  const captureSnapshot = useCallback(async (reason = "auto") => {
    if (snapshotInFlightRef.current || savedSnapshotCountRef.current >= 4) return false;
    try {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth) return false;

      snapshotInFlightRef.current = true;
      const canvas = document.createElement("canvas");
      canvas.width = 360;
      canvas.height = Math.round(360 * (video.videoHeight / video.videoWidth)) || 270;
      const ctx = canvas.getContext("2d");
      if (!ctx) return false;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.76);

      const candidateId = stateRef.current.candidate ? stateRef.current.candidate.id : null;
      if (!candidateId) return false;

      const res = await axios.post(`${API_URL}/api/interview/snapshot`, {
        candidate_id: candidateId, image_base64: dataUrl, reason
      }, { headers: { Authorization: `Bearer ${token}` } });
      if (typeof res.data?.count === "number") savedSnapshotCountRef.current = res.data.count;
      else savedSnapshotCountRef.current = Math.min(4, savedSnapshotCountRef.current + 1);
      return true;
    } catch (e) {
      return false;
    } finally {
      snapshotInFlightRef.current = false;
    }
  }, [token]);

  const ensureSnapshot = useCallback((reason = "auto") => {
    if (savedSnapshotCountRef.current >= 4) return;
    // Kamera bazen yeni bağlanmış oluyor; kısa aralıklarla birkaç kez dene.
    [0, 700, 1800].forEach(delay => {
      setTimeout(() => {
        if (savedSnapshotCountRef.current < 4) captureSnapshot(reason);
      }, delay);
    });
  }, [captureSnapshot]);

  // ===== FAZ D: MİMİK ANALİZ KARELERİ — doğrulama karelerinden AYRI =====
  // 45 sn'de bir, üst sınır 24. reason='mimic_sample'; backend ayrı kotada tutar, panel/PDF'te
  // göstermez. Kendi in-flight/sayaç ref'leri — doğrulama karesi akışına dokunmaz.
  const mimicFrameCountRef = useRef(0);
  const mimicInFlightRef = useRef(false);
  // Aralık sabit değil: mülakatın planlanan toplam süresine göre hesaplanır (aralik = süre/24),
  // böylece 24 kare mülakatın TAMAMINA eşit dağılır. Alt sınır 30 sn (kısa mülakatta sağanak yok).
  // Süre startInterview yanıtından (total_duration_seconds) gelince güncellenir.
  const [mimicIntervalMs, setMimicIntervalMs] = useState(45000);
  const captureMimicFrame = useCallback(async () => {
    if (mimicInFlightRef.current || mimicFrameCountRef.current >= 24 || stateRef.current.finished) return;
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) return;
    const cand = stateRef.current.candidate;
    if (!cand || !cand.id) return;
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
        candidate_id: cand.id, image_base64: dataUrl, reason: "mimic_sample",
        elapsed_ms: Math.round((totalElapsedRef.current || 0) * 1000), level: cand.level ?? null,
      }, { headers: { Authorization: `Bearer ${token}` } });
      if (typeof res.data?.count === "number") mimicFrameCountRef.current = res.data.count;
      else mimicFrameCountRef.current += 1;
    } catch (e) {
      // Mimik karesi kritik değil — sessiz geç.
    } finally {
      mimicInFlightRef.current = false;
    }
  }, [token]);

  useEffect(() => {
    if (step !== "interview" || starting || finished) return;
    if (introText && !introConfirmed) return;
    const id = setInterval(() => { captureMimicFrame(); }, mimicIntervalMs);
    return () => clearInterval(id);
  }, [step, starting, finished, introText, introConfirmed, captureMimicFrame, mimicIntervalMs]);

  useEffect(() => {
    if (step !== "interview" || starting || finished || totalDurationRef.current <= 0) return;
    const elapsedRatio = (totalDurationRef.current - totalSecondsLeft) / totalDurationRef.current;
    const checkpoints = [0.02, 0.15, 0.35, 0.60];
    checkpoints.forEach((ratio, idx) => {
      if (!snapshotTakenRef.current[idx] && elapsedRatio >= ratio) {
        snapshotTakenRef.current[idx] = true;
        ensureSnapshot(`time_${idx + 1}`);
      }
    });
  }, [totalSecondsLeft, step, starting, finished, ensureSnapshot]);


  const uploadCV = async () => {
    if (!cvFile) return;
    setCvUploading(true);
    setCvError("");
    const mandatory = candidate && candidate.level >= 2;
    try {
      const formData = new FormData();
      formData.append("file", cvFile);
      await axios.post(`${API_URL}/api/candidate/upload-cv`, formData, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" }
      });
      setCvUploading(false);
      setStep("interview");
    } catch (e) {
      setCvError(
        mandatory
          ? "CV yüklenemedi: " + (e.response?.data?.detail || "bilinmeyen hata") + ". Bu seviyede CV zorunlu, lütfen tekrar deneyin."
          : "CV yüklenemedi: " + (e.response?.data?.detail || "bilinmeyen hata. CV olmadan devam edebilirsiniz.")
      );
      setCvUploading(false);
      if (!mandatory) setStep("interview");
    }
  };

  const skipCV = () => setStep("interview");

  // ===== Mülakatı başlat (step "interview" olunca, bir kez) =====
  const interviewInitiated = useRef(false);
  useEffect(() => {
    if (step !== "interview" || interviewInitiated.current) return;
    interviewInitiated.current = true;
    startInterview();
  }, [step]);

  const startInterview = async () => {
    setStarting(true);
    try {
      const res = await axios.post(`${API_URL}/api/interview/start`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessages([{ role: "assistant", content: res.data.message }]);
      setQuestionSecondsLeft(res.data.question_duration || 60);
      const totalDur = res.data.total_duration_seconds || 1080;
      setTotalSecondsLeft(totalDur);
      totalDurationRef.current = totalDur;
      // Mimik kareleri mülakatın tamamına eşit dağılsın: aralik = toplam_sure / 24, alt sınır 30 sn.
      setMimicIntervalMs(Math.max(30, Math.round(totalDur / 24)) * 1000);
      if (res.data.intro_text) setIntroText(res.data.intro_text);
      ensureSnapshot("start");
    } catch (e) {
      if (e.response?.status === 401) {
        navigate("/mulakat");
        return;
      }
      setMessages([{ role: "assistant", content: "Mülakat başlatılırken bir bağlantı hatası oluştu. Lütfen sayfayı yenileyip tekrar deneyin." }]);
    } finally {
      setStarting(false);
    }
  };

  // ===== Mesaj gönderme - her zaman ref üzerinden en güncel state'i okur =====
  const sendMessageRef = useRef();
  sendMessageRef.current = async (autoSend, overrideContent) => {
    const s = stateRef.current;
    if (s.loading || s.finished) return;
    const content = (overrideContent !== undefined ? overrideContent.trim() : s.input.trim()) || (autoSend ? "(Bu soruya yanıt verilmeden zaman aşımına uğradı.)" : "");
    if (!content) return;

    if (!autoSend) { autoSentForQuestionRef.current = false; graceGrantedRef.current = false; setTimeoutNudge(""); }
    const userMsg = { role: "user", content };
    const newMessages = [...s.messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    ensureSnapshot(autoSend ? "auto_answer" : "answer");

    const history = newMessages.map(m => ({ role: m.role, content: m.content }));
    const candidateId = s.candidate ? s.candidate.id : null;

    try {
      const res = await axios.post(`${API_URL}/api/interview/chat`, {
        candidate_id: candidateId, message: content,
        history: history.slice(0, -1), elapsed_seconds: totalElapsedRef.current
      }, { headers: { Authorization: `Bearer ${token}` } });

      setMessages(prev => [...prev, { role: "assistant", content: res.data.message }]);

      if (res.data.completed) {
        ensureSnapshot("finish");
        // Kısa mülakatlarda 4 kare tamamlanamayabilir; bitişte kalanları sessizce tamamlamayı dener.
        [600, 1500, 2600].forEach((delay) => setTimeout(() => ensureSnapshot("finish_fill"), delay));
        // KAPANIŞ SIRASI: teşekkür mesajı (yukarıda mesaj balonuna eklendi) + bekletmeden
        // bitiş ekranı; rapor arkada üretilir (res.data.processing).
        setReportProcessing(res.data.processing === true);
        setFinished(true);
        setScore(res.data.score);
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      } else {
        autoSentForQuestionRef.current = false;
        graceGrantedRef.current = false;
        setTimeoutNudge("");
        setQuestionSecondsLeft(res.data.question_duration || 60);
      }
    } catch (e) {
      autoSentForQuestionRef.current = false;
      graceGrantedRef.current = false;
      setTimeoutNudge("");
      setQuestionSecondsLeft(60);
      setMessages(prev => [...prev, { role: "assistant", content: "Bağlantı hatası oluştu, lütfen tekrar deneyin." }]);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = (autoSend, overrideContent) => {
    if (sendMessageRef.current) sendMessageRef.current(autoSend, overrideContent);
  };

  // ===== İhlal bildirimi (BÖLÜM 3: tip + somut detay + mülakat saniyesi) =====
  const reportViolationRef = useRef();
  reportViolationRef.current = async (violationType = "tab_switch", detail = null) => {
    if (stateRef.current.finished) return;
    const candidateId = stateRef.current.candidate ? stateRef.current.candidate.id : null;
    if (!candidateId) return;
    try {
      const res = await axios.post(`${API_URL}/api/interview/violation`, {
        candidate_id: candidateId, violation_type: violationType, detail,
        elapsed_seconds: Math.round(totalElapsedRef.current || 0),
      }, { headers: { Authorization: `Bearer ${token}` } });

      if (res.data.terminated) {
        setTerminated(true);
        setReportProcessing(res.data.processing === true);
        setFinished(true);
        setScore(res.data.score);
        setMessages(prev => [...prev, { role: "assistant", content: res.data.message || "Mülakat ihlal nedeniyle sonlandırıldı." }]);
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      } else if (violationType !== "camera_off") {
        setViolationWarning(`Uyarı (${res.data.violation_count}/3): Mülakat sırasında başka sekme veya uygulamaya geçmemelisiniz. 3. ihlalde mülakat otomatik sonlanır.`);
        setTimeout(() => setViolationWarning(""), 6000);
      }
    } catch (e) { /* sessiz geç, ihlal bildirimi kritik değil */ }
  };

  // BÖLÜM 3: 2 dk+ sekme dışı kalma → prolonged_absence (tek başına sonlandırır)
  const hiddenSinceRef = useRef(null);
  useEffect(() => {
    if (step !== "interview") return;
    const onVis = () => {
      if (document.hidden) {
        hiddenSinceRef.current = Date.now();
      } else if (hiddenSinceRef.current) {
        const awayMs = Date.now() - hiddenSinceRef.current;
        hiddenSinceRef.current = null;
        if (awayMs > 120000) {
          reportViolationRef.current("prolonged_absence", `Aday ~${Math.round(awayMs / 1000)} sn boyunca mülakat ekranından ayrıldı`);
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [step]);

  useEffect(() => {
    if (step !== "interview") return;
    // ÖNEMLİ: 'visibilitychange' ve 'blur' olayları, sekme değiştirme gibi TEK bir gerçek
    // eylemde neredeyse aynı anda İKİSİ BİRDEN tetiklenebiliyor — bu da tek bir ihlali
    // 2 kez sayıp adayı 1-2 gerçek geçişte 3 ihlal eşiğine ulaştırıyordu. Kısa bir
    // "soğuma süresi" ile aynı eylemin iki kez sayılması engelleniyor.
    let lastReportTs = 0;
    // BAŞLANGIÇ HOŞGÖRÜ SÜRESİ: mülakat yeni başladığında (kamera/mikrofon izin
    // pencereleri açılıp kapanırken) tarayıcı sahte blur/visibilitychange olayı
    // üretebiliyor — bu, gerçek bir sekme değişimi olmadığı halde ihlal sayılıp
    // adayı hiç soru sorulmadan anında sonlandırabiliyordu. İlk birkaç saniye
    // ihlal takibi devre dışı bırakılıyor.
    const graceUntil = Date.now() + 10000;
    const reportOnce = () => {
      const now = Date.now();
      if (now < graceUntil) return; // başlangıç hoşgörü süresi, yoksay
      if (now - lastReportTs < 1500) return; // aynı olayın blur+visibilitychange tekrarı, yoksay
      lastReportTs = now;
      reportViolationRef.current();
    };
    const handleVisibility = () => { if (document.hidden) reportOnce(); };
    const handleBlur = () => reportOnce();
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
    };
  }, [step]);

  // ===== Tek interval: toplam süre + soru süresi birlikte yönetilir =====
  useEffect(() => {
    if (step !== "interview" || starting || finished) return;
    if (introText && !introConfirmed) return; // ön bilgi ekranı onaylanmadan süre işlemeye başlamaz

    const interval = setInterval(() => {
      totalElapsedRef.current += 1;
      setTotalSecondsLeft(prev => (prev > 0 ? prev - 1 : 0));
      setQuestionSecondsLeft(prev => {
        if (prev <= 1) {
          if (!graceGrantedRef.current) {
            // İlk dolma: hemen yanıtsız sayıp geçme — uyar ve ek süre ver.
            graceGrantedRef.current = true;
            setTimeoutNudge("Süre doldu — hâlâ orada mısınız? Cevap vermeniz için ek süre tanındı.");
            return 20;
          }
          if (!autoSentForQuestionRef.current) {
            autoSentForQuestionRef.current = true;
            setTimeoutNudge("");
            sendMessage(true);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [step, starting, finished, introText, introConfirmed]);

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(false); }
  };

  // ===== Ses listesi önceden yüklenir: speechSynthesis.getVoices() sayfa açılışında
  // genelde BOŞ döner (sesler asenkron yükleniyor) — bu yüzden Türkçe ses bulunamayıp
  // tarayıcı varsayılan (çoğu zaman İngilizce) sese düşüyordu. Bunu önceden yükleyip
  // cache'liyoruz. =====
  const ttsVoicesRef = useRef([]);
  useEffect(() => {
    if (!speechSynthSupported) return;
    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      if (v && v.length) ttsVoicesRef.current = v;
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    // Bazı tarayıcılarda voiceschanged güvenilir tetiklenmiyor; ek güvenlik ağı.
    const retries = [300, 800, 1500].map(delay => setTimeout(loadVoices, delay));
    return () => {
      retries.forEach(clearTimeout);
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [speechSynthSupported]);

  // ===== Sesli akış: yeni AI sorusu geldiğinde oku, okuma bitince mikrofonu otomatik aç =====
  const speakTextBrowser = useCallback((text, onDone) => {
    if (!speechSynthSupported || !text) { if (onDone) onDone(); return; }
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = speechLangCode;
      let voices = ttsVoicesRef.current;
      if (!voices || !voices.length) voices = window.speechSynthesis.getVoices();
      const langPrefix = speechLangCode.split("-")[0].toLowerCase();
      const trVoice = voices.find(v => v.lang && v.lang.toLowerCase() === speechLangCode.toLowerCase())
        || voices.find(v => v.lang && v.lang.toLowerCase().startsWith(langPrefix));
      if (trVoice) utter.voice = trVoice;
      utter.onend = () => { if (onDone) onDone(); };
      utter.onerror = () => { if (onDone) onDone(); };
      window.speechSynthesis.speak(utter);
    } catch (e) {
      if (onDone) onDone();
    }
  }, [speechSynthSupported, speechLangCode]);

  const speakText = useCallback((text, onDone) => {
    if (!text) { if (onDone) onDone(); return; }
    if (!useOpenAIVoiceRef.current || !token) {
      speakTextBrowser(text, onDone);
      return;
    }
    axios.post(`${API_URL}/api/candidate/voice-speak`,
      { text, language: (candidate && candidate.interview_language) || "tr" },
      { headers: { Authorization: `Bearer ${token}` }, responseType: "blob" }
    ).then(resp => {
      const url = URL.createObjectURL(resp.data);
      const audio = new Audio(url);
      openAIAudioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); if (onDone) onDone(); };
      audio.onerror = () => { URL.revokeObjectURL(url); useOpenAIVoiceRef.current = false; speakTextBrowser(text, onDone); };
      audio.play().catch(() => {
        URL.revokeObjectURL(url); useOpenAIVoiceRef.current = false; speakTextBrowser(text, onDone);
      });
    }).catch(() => {
      // OpenAI tarafı yok/hata verdi (örn. OPENAI_API_KEY tanımlı değil) — bu oturumun
      // geri kalanında tekrar denemeden direkt tarayıcı sesine düş.
      useOpenAIVoiceRef.current = false;
      speakTextBrowser(text, onDone);
    });
  }, [speakTextBrowser, token, candidate]);

  const startListeningBrowser = useCallback(() => {
    if (!SpeechRecognitionCtor) { setVoicePhase("error"); return; }
    try {
      recordingModeRef.current = "browser";
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = speechLangCode;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      let finalTranscript = "";
      recognition.onresult = (event) => {
        finalTranscript = Array.from(event.results).map(r => r[0].transcript).join(" ").trim();
      };
      recognition.onerror = () => {
        setIsListening(false);
        markVoiceFailure();
      };
      recognition.onend = () => {
        setIsListening(false);
        if (finalTranscript) {
          markVoiceSuccess();
          setVoicePhase("sending");
          sendMessage(false, finalTranscript);
        } else {
          markVoiceFailure();
        }
      };
      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
      setVoicePhase("listening");
    } catch (e) {
      setVoicePhase("error");
    }
  }, [SpeechRecognitionCtor, speechLangCode]);

  const startListening = useCallback(async () => {
    if (useOpenAIVoiceRef.current && token) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recordingModeRef.current = "openai";
        const recorder = new MediaRecorder(stream);
        audioChunksRef.current = [];
        recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data); };
        recorder.onstop = async () => {
          stream.getTracks().forEach(t => t.stop());
          setIsListening(false);
          const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          // ÖNEMLİ: Whisper, sessiz/neredeyse sessiz ses kayıtlarında bazen anlamsız bir
          // metin "halüsinasyon" olarak üretebiliyor (ör. rastgele bir altyazı kredisi
          // uydurması gibi). Ses seviyesi hiç eşiği geçmediyse (gerçekten konuşulmadıysa)
          // Whisper'a hiç göndermeden direkt "sizi duyamadım" durumuna geçiyoruz.
          if (blob.size < 500 || !hasSpokenInRecordingRef.current) { markVoiceFailure(); return; }
          try {
            const formData = new FormData();
            formData.append("file", blob, "answer.webm");
            const resp = await axios.post(`${API_URL}/api/candidate/voice-transcribe`, formData, {
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" }
            });
            const text = (resp.data && resp.data.text || "").trim();
            if (text) { setVoicePhase("sending"); sendMessage(false, text); }
            else { setVoicePhase("error"); }
          } catch (e) {
            // Whisper başarısız oldu — bu oturum için tarayıcı yoluna düş ve tekrar dene.
            useOpenAIVoiceRef.current = false;
            startListeningBrowser();
          }
        };
        mediaRecorderRef.current = recorder;
        recorder.start();
        setIsListening(true);
        setVoicePhase("listening");

        // ===== Sessizlik algılama: buton YOK, konuşmayı bırakınca kayıt kendiliğinden
        // durur — gerçek karşılıklı konuşma hissi için bu şart. Web Audio API ile ses
        // seviyesi izlenir; belirli bir süre sessizlik olursa kayıt otomatik durdurulur. =====
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const SILENCE_THRESHOLD = 12; // 0-255 ölçeğinde ortalama genlik eşiği (ortam gürültüsüne göre ayarlanabilir)
        const SILENCE_DURATION_MS = 1400; // bu kadar süre sessizlik olursa konuşma bitti say
        const MAX_RECORDING_MS = 45000; // güvenlik ağı: sessizlik hiç algılanmazsa yine de durdur
        let silenceStart = null;
        let hasSpoken = false;
        hasSpokenInRecordingRef.current = false;
        const startTs = Date.now();

        const checkSilence = () => {
          if (recorder.state === "inactive") return; // kayıt zaten durduysa döngüyü bırak
          analyser.getByteTimeDomainData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) { sum += Math.abs(dataArray[i] - 128); }
          const avg = sum / dataArray.length;

          if (avg > SILENCE_THRESHOLD) {
            hasSpoken = true;
            hasSpokenInRecordingRef.current = true;
            silenceStart = null;
          } else if (hasSpoken) {
            if (silenceStart === null) silenceStart = Date.now();
            else if (Date.now() - silenceStart > SILENCE_DURATION_MS) {
              audioCtx.close();
              if (recorder.state !== "inactive") recorder.stop();
              return;
            }
          }

          if (Date.now() - startTs > MAX_RECORDING_MS) {
            audioCtx.close();
            if (recorder.state !== "inactive") recorder.stop();
            return;
          }
          requestAnimationFrame(checkSilence);
        };
        requestAnimationFrame(checkSilence);
        return;
      } catch (e) {
        // Mikrofon izni/MediaRecorder hatası — tarayıcı yoluna düş.
        useOpenAIVoiceRef.current = false;
      }
    }
    startListeningBrowser();
  }, [token, startListeningBrowser]);

  // Klasik (metinli) mod için tekli dikte butonu — sadece yazı moduna geçilirse kullanılır.
  const toggleListening = () => {
    if (!SpeechRecognitionCtor) return;
    if (isListening) { recognitionRef.current?.stop(); return; }
    try {
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = speechLangCode;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        const transcript = Array.from(event.results).map(r => r[0].transcript).join(" ");
        setInput(prev => (prev ? prev + " " : "") + transcript);
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    } catch (e) {
      setIsListening(false);
    }
  };

  // Yeni asistan mesajı geldiğinde: TAM SESLİ modda otomatik oku, okuma bitince dinlemeye geç.
  useEffect(() => {
    if (step !== "interview" || !introConfirmed || messages.length === 0) return;
    const lastIdx = messages.length - 1;
    const last = messages[lastIdx];
    if (last.role !== "assistant" || lastIdx === spokenIndexRef.current) return;
    spokenIndexRef.current = lastIdx;

    if (voiceModeActive) {
      setVoicePhase("speaking");
      setVoiceTranscript("");
      speakText(last.content, () => { if (!stateRef.current.finished) startListening(); });
    } else if (autoSpeak) {
      speakText(last.content);
    }
  }, [messages, voiceModeActive, autoSpeak, step, introConfirmed, speakText, startListening]);

  const retryVoiceAnswer = () => {
    setVoiceTranscript("");
    startListening();
  };

  const handlePaste = (e) => {
    e.preventDefault();
    setViolationWarning("Yapıştırma (paste) bu mülakatta devre dışı bırakılmıştır. Lütfen cevabınızı kendiniz yazın.");
    setTimeout(() => setViolationWarning(""), 4000);
  };

  // ========================= RENDER =========================

  if (step === "camera") {
    return (
      <div style={{ minHeight: "100vh", background: colors.bg, display: "flex", flexDirection: "column", alignItems: "center", padding: 24, justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 480, background: colors.white, borderRadius: 12, padding: 32, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📷</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: colors.navy, marginBottom: 12 }}>Kamera İzni Gerekli</div>
          <div style={{ color: colors.slate, lineHeight: 1.6, marginBottom: 20, fontSize: 14 }}>
            Bu mülakat kamera açık şekilde gerçekleştirilmektedir. Mülakata başlamak için kameranıza erişim izni vermeniz gerekmektedir.
          </div>
          <div style={{ background: "#fef9e7", border: "1px solid #f59e0b", borderRadius: 8, padding: 14, marginBottom: 20, fontSize: 13, color: "#92400e", textAlign: "left" }}>
            <strong>Mülakat kuralları:</strong>
            <ul style={{ margin: "8px 0 0 18px", padding: 0 }}>
              <li>Kamera mülakat boyunca açık olmalıdır</li>
              <li>Başka sekme veya uygulamaya geçilmemelidir (3. ihlalde mülakat sonlanır)</li>
              <li>Cevaplar kendi sözcüklerinizle, yapıştırma yapılmadan yazılmalıdır</li>
              <li>Her soru için belirli bir süre tanınmaktadır</li>
            </ul>
          </div>
          {cameraError && <div style={{ color: colors.red, marginBottom: 16, fontSize: 13 }}>{cameraError}</div>}
          <button onClick={requestCamera} style={{ background: colors.navy, color: "#fff", border: "none", borderRadius: 8, padding: "14px 32px", fontSize: 16, fontWeight: 600, cursor: "pointer", width: "100%" }}>
            Kameramı Etkinleştir ve Başla
          </button>
        </div>
      </div>
    );
  }

  if (step === "cv") {
    const cvMandatory = candidate && candidate.level >= 2;
    return (
      <div style={{ minHeight: "100vh", background: colors.bg, display: "flex", flexDirection: "column", alignItems: "center", padding: 24, justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 480, background: colors.white, borderRadius: 12, padding: 32, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: colors.navy, marginBottom: 8 }}>
            {cvMandatory ? "CV Yükleme (Zorunlu)" : "CV Yüklemek İster misiniz?"}
          </div>
          <div style={{ color: colors.slate, fontSize: 13, marginBottom: 12 }}>
            {cvMandatory
              ? "Bu mülakat seviyesinde CV yüklemeden devam edilemez. Yüklediğiniz CV, sorularımızın deneyiminize göre şekillenmesi için kullanılır. (PDF veya Word)"
              : "Opsiyoneldir. Yüklerseniz mülakat sorularımız deneyiminize göre kişiselleştirilir. (PDF veya Word)"}
          </div>
          <div style={{ background: "#ecfdf5", border: "1px solid #22c55e", color: "#166534", borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 12, fontWeight: 600 }}>✅ Kamera izni alındı. Aşağıdaki ön izleme canlıdır.</div>
          <video ref={attachVideoRef} autoPlay muted playsInline style={{ width: 140, maxHeight: 100, objectFit: "cover", borderRadius: 8, marginBottom: 14, transform: "scaleX(-1)", border: "2px solid #22c55e" }} />
          <input type="file" accept=".pdf,.doc,.docx,.pdf" onChange={e => setCvFile(e.target.files[0] || null)} style={{ marginBottom: 16, width: "100%" }} />
          {cvError && <div style={{ color: colors.red, fontSize: 12, marginBottom: 12 }}>{cvError}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={uploadCV} disabled={!cvFile || cvUploading}
              style={{ flex: 1, background: cvFile && !cvUploading ? colors.navy : colors.border, color: "#fff", border: "none", borderRadius: 8, padding: "12px", fontWeight: 600, cursor: cvFile && !cvUploading ? "pointer" : "not-allowed" }}>
              {cvUploading ? "Yükleniyor..." : "Yükle ve Devam Et"}
            </button>
            {!cvMandatory && (
              <button onClick={skipCV} disabled={cvUploading}
                style={{ flex: 1, background: "#f1f5f9", color: colors.navy, border: "none", borderRadius: 8, padding: "12px", fontWeight: 600, cursor: cvUploading ? "not-allowed" : "pointer" }}>
                Atla
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="interview-page" style={{ minHeight: "100vh", background: colors.bg, display: "flex", flexDirection: "column", alignItems: "center", padding: 24 }}>
      <style>{`
        @media (max-width: 640px) {
          .interview-page { padding: 10px !important; }
          .interview-shell { max-width: 100% !important; gap: 10px !important; }
          .interview-header { padding: 12px !important; flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; }
          .interview-layout { flex-direction: column !important; gap: 10px !important; }
          .interview-camera-col { width: 100% !important; display: grid !important; grid-template-columns: 112px 1fr !important; gap: 10px !important; align-items: stretch !important; }
          .camera-preview { height: 90px !important; }
          .interview-chat-scroll { min-height: 300px !important; max-height: 48vh !important; padding: 12px !important; }
          .interview-bubble { max-width: 88% !important; font-size: 13px !important; }
          .interview-input-row { flex-direction: column !important; padding: 12px !important; }
          .interview-send-btn { width: 100% !important; }
        }
      `}</style>
      {introText && !introConfirmed && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.72)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
          <div style={{ background: colors.white, borderRadius: 12, padding: 28, maxWidth: 480, width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.25)" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: colors.navy, marginBottom: 14 }}>Mülakata Başlamadan Önce</div>
            <div style={{ color: colors.slate, lineHeight: 1.7, fontSize: 14, whiteSpace: "pre-line", marginBottom: 22 }}>
              {introText}
            </div>
            <button
              onClick={() => {
                // Mobil tarayıcılar (özellikle iOS/Android Chrome), kullanıcı tıklaması
                // olmadan tetiklenen sesli okumayı sessizce engelliyor. Bu yüzden ilk
                // okumayı burada, doğrudan tıklama içinde (senkron) başlatıyoruz —
                // bu "kullanıcı jesti" sesi kilidini açıyor, sonraki otomatik okumalar
                // da bu sayede çalışabiliyor.
                if (speechSynthSupported) {
                  try { window.speechSynthesis.speak(new SpeechSynthesisUtterance("")); } catch (e) { /* yoksay */ }
                }
                setIntroConfirmed(true);
                if (voiceModeActive && messages.length > 0) {
                  const lastIdx = messages.length - 1;
                  const last = messages[lastIdx];
                  if (last && last.role === "assistant") {
                    spokenIndexRef.current = lastIdx;
                    setVoicePhase("speaking");
                    setVoiceTranscript("");
                    speakText(last.content, () => { if (!stateRef.current.finished) startListening(); });
                  }
                } else if (autoSpeak && messages.length > 0) {
                  const last = messages[messages.length - 1];
                  if (last && last.role === "assistant") {
                    spokenIndexRef.current = messages.length - 1;
                    speakText(last.content);
                  }
                }
              }}
              style={{ width: "100%", background: colors.navy, color: "#fff", border: "none", borderRadius: 8, padding: "12px 16px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
            >
              Anladım, Başlıyorum
            </button>
          </div>
        </div>
      )}

      <div className="interview-shell" style={{ width: "100%", maxWidth: 720, display: "flex", flexDirection: "column", gap: 16 }}>

        <div className="interview-header" style={{ background: colors.navy, borderRadius: 12, padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ color: colors.blue, fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>MedeX SMO</div>
            <div style={{ color: "#fff", fontSize: 18, fontWeight: 700 }}>AI Mülakat</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {!finished && speechSynthSupported && (
              <button
                onClick={() => { setAutoSpeak(v => !v); if (autoSpeak) window.speechSynthesis.cancel(); }}
                title={autoSpeak ? "Soruların sesli okunmasını kapat" : "Soruları sesli oku"}
                style={{ background: "rgba(255,255,255,0.12)", border: "none", borderRadius: 8, width: 34, height: 34, cursor: "pointer", fontSize: 16, color: "#fff" }}>
                {autoSpeak ? "🔊" : "🔇"}
              </button>
            )}
            {!finished && (
              <div style={{ textAlign: "center" }}>
                <div style={{ color: colors.blue, fontSize: 10, fontWeight: 600 }}>TOPLAM SÜRE</div>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{formatTime(totalSecondsLeft)}</div>
              </div>
            )}
            {candidate && (
              <div style={{ textAlign: "right" }}>
                <div style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>{candidate.name}</div>
                <div style={{ color: colors.blue, fontSize: 12 }}>{candidate.position}</div>
              </div>
            )}
          </div>
        </div>

        {speechSynthSupported && !finished && (
          <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e40af", borderRadius: 8, padding: "8px 14px", fontSize: 12, textAlign: "center" }}>
            🔊 Sorular sesli okunuyor, isterseniz {SpeechRecognitionCtor ? "mikrofon ile de " : ""}yazarak cevap verebilirsiniz. Hoparlör simgesinden kapatabilirsiniz.
          </div>
        )}

        {cameraError && (
          <div style={{ background: "#fef2f2", border: "1px solid #ef4444", color: "#ef4444", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 600 }}>
            📷 {cameraError}
          </div>
        )}

        {violationWarning && (
          <div style={{ background: "#fef2f2", border: "1px solid #ef4444", color: "#ef4444", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 600 }}>
            ⚠️ {violationWarning}
          </div>
        )}

        <div className="interview-layout" style={{ display: "flex", gap: 16 }}>
          <div className="interview-camera-col" style={{ width: 100, flexShrink: 0 }}>
            <CameraPreview attachVideoRef={attachVideoRef} />
            {!finished && <QuestionTimer secondsLeft={questionSecondsLeft} />}
            {!finished && timeoutNudge && (
              <div style={{ background: "#fef9e7", border: "1px solid #f59e0b", color: "#92400e", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 600, textAlign: "center", marginTop: 8 }}>
                ⏰ {timeoutNudge}
              </div>
            )}
          </div>

          <div style={{ flex: 1, background: colors.white, borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column" }}>
            <div style={{ background: "#f8fafc", borderBottom: `1px solid ${colors.border}`, padding: "10px 20px", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, background: finished ? colors.slate : colors.green, borderRadius: "50%" }}></div>
              <span style={{ fontSize: 13, color: finished ? colors.slate : colors.green, fontWeight: 600 }}>
                {starting ? "Bağlanıyor..." : finished ? "Mülakat Tamamlandı" : "Mülakat Devam Ediyor"}
              </span>
            </div>

            <div className="interview-chat-scroll" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16, minHeight: 380, maxHeight: 460, overflowY: "auto" }}>
              {starting && messages.length === 0 && (
                <div style={{ textAlign: "center", color: colors.slate, padding: 40 }}>Mülakat başlatılıyor...</div>
              )}
              {messages.map((msg, i) => (
                <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                  {msg.role === "assistant" && (
                    <div style={{ width: 32, height: 32, background: colors.navy, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginRight: 10, flexShrink: 0, marginTop: 2 }}>
                      <span style={{ color: colors.blue, fontSize: 14, fontWeight: 700 }}>M</span>
                    </div>
                  )}
                  <div className="interview-bubble" style={{
                    maxWidth: "75%", padding: "12px 16px",
                    borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                    background: msg.role === "user" ? colors.navy : "#f1f5f9",
                    color: msg.role === "user" ? "#fff" : "#1e293b",
                    fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap"
                  }}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, background: colors.navy, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ color: colors.blue, fontSize: 14, fontWeight: 700 }}>M</span>
                  </div>
                  <div style={{ background: "#f1f5f9", borderRadius: "18px 18px 18px 4px", padding: "12px 16px" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      {[0, 1, 2].map(i => (
                        <div key={i} style={{ width: 8, height: 8, background: "#94a3b8", borderRadius: "50%", animation: "bounce 1.2s infinite", animationDelay: `${i * 0.2}s` }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {!finished && !starting && voiceModeActive && (
              <div style={{ borderTop: `1px solid ${colors.border}`, padding: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                {voicePhase === "idle" && !loading && (
                  <div style={{ color: colors.slate, fontSize: 13 }}>Bir sonraki soru bekleniyor...</div>
                )}
                {voicePhase === "speaking" && (
                  <div style={{ color: colors.slate, fontSize: 14, fontWeight: 600 }}>🔊 Soru okunuyor...</div>
                )}
                {voicePhase === "listening" && (
                  <div style={{ color: colors.navy, fontSize: 14, fontWeight: 700 }}>🎙️ Sizi dinliyorum...</div>
                )}
                {voicePhase === "error" && (
                  <>
                    <div style={{ color: colors.red, fontSize: 13, fontWeight: 600 }}>Sizi net anlayamadım, tekrar dener misiniz?</div>
                    <button onClick={retryVoiceAnswer}
                      style={{ background: colors.navy, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                      🎤 Tekrar Dene
                    </button>
                  </>
                )}
                <button onClick={() => { setForceTextMode(true); try { window.speechSynthesis.cancel(); } catch (e) {} }}
                  style={{ background: "none", border: "none", color: colors.slate, fontSize: 12, textDecoration: "underline", cursor: "pointer", marginTop: 4 }}>
                  Yazarak devam etmek istiyorum
                </button>
              </div>
            )}

            {!finished && !starting && !voiceModeActive && (
              <div className="interview-input-row" style={{ borderTop: `1px solid ${colors.border}`, padding: 16, display: "flex", gap: 10 }}>
                <textarea
                  value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey} onPaste={handlePaste}
                  placeholder="Cevabınızı yazın... (Enter ile gönderin)" rows={2}
                  style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: `2px solid ${colors.border}`, fontSize: 14, outline: "none", resize: "none", fontFamily: "Inter, sans-serif", lineHeight: 1.5 }}
                  onFocus={e => e.target.style.borderColor = colors.navyLight}
                  onBlur={e => e.target.style.borderColor = colors.border}
                />
                {SpeechRecognitionCtor && (
                  <button onClick={toggleListening} title={isListening ? "Dinlemeyi durdur" : "Mikrofonla cevap dikte et"}
                    style={{ background: isListening ? colors.red : "#f1f5f9", color: isListening ? "#fff" : colors.navy, border: "none", borderRadius: 8, padding: "10px 14px", fontSize: 16, cursor: "pointer", alignSelf: "flex-end" }}>
                    {isListening ? "⏹️" : "🎤"}
                  </button>
                )}
                <button className="interview-send-btn" onClick={() => sendMessage(false)} disabled={!input.trim() || loading}
                  style={{ background: input.trim() && !loading ? colors.navy : colors.border, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: input.trim() && !loading ? "pointer" : "not-allowed", alignSelf: "flex-end", fontFamily: "Inter, sans-serif" }}>
                  Gönder
                </button>
              </div>
            )}
          </div>
        </div>

        {finished && (
          <div style={{ background: colors.white, borderRadius: 12, padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>{terminated ? "⚠️" : "🎉"}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: colors.navy, marginBottom: 8 }}>
              {terminated ? "Mülakat İhlal Nedeniyle Sonlandırıldı" : "Mülakatınız Tamamlandı"}
            </div>
            <div style={{ color: colors.slate, marginBottom: 20, lineHeight: 1.6 }}>
              {terminated
                ? (reportProcessing
                    ? "Mülakat kuralları ihlal edildiği için süreç sonlandırılmıştır. Raporunuz hazırlanıyor; bu ekranı artık kapatabilirsiniz."
                    : "Mülakat kuralları ihlal edildiği için süreç sonlandırılmıştır.")
                : (reportProcessing
                    ? "Teşekkür ederiz, mülakatınız tamamlandı. Raporunuz hazırlanıyor; bu ekranı artık kapatabilirsiniz. Değerlendirmeniz hazır olduğunda insan kaynakları ekibimiz sizinle iletişime geçecektir."
                    : "Değerlendirmeniz insan kaynakları ekibimize iletildi. En kısa sürede sizinle iletişime geçeceğiz.")}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes bounce { 0%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-6px); } }
      `}</style>
    </div>
  );
}
