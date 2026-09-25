// İş emri — MÜLAKAT ÖNCESİ KAMERA KALİTE KAPISI (+ GÖRÜNTÜ VE SES GÖZLEMİ ZENGİLEŞTİRME turunda
// DENETÇİ MANTIĞINA uyarlandı) — L1 (Interview.js) ve L2/L3 (RealtimeInterview.js) TARAFINDAN
// ORTAK kullanılan doğrulama ekranı. Mantık cameraQualityGate.js'te (tek modül); bu bileşen
// yalnız deneme sayacını ve kullanıcıya gösterilecek kısa uyarıyı yönetir — kod ekranlar
// arasında KOPYALANMAZ.
//
// ANA PRENSİP (DEĞİŞMEZ): bu sistem POLİS değil DENETÇİDİR — kuralı hatırlatır, gözlemler,
// gerekirse kısa uyarı gösterir, kaydeder, raporlar. ASLA mülakatı bloklamaz/durdurmaz/pause
// etmez. Eskiden HARD FAIL durumları sınırsız manuel "Tekrar Kontrol Et" ile bloke ediyordu —
// bu davranış KALDIRILDI: artık HARD ve SOFT durumlar AYNI bounded deneme sayacını paylaşır,
// sayaç dolunca (kullanıcı hiç tıklamasa bile) UNVERIFIED ile mülakat otomatik olarak devam eder.
//
// GÜVENLİK SINIRI: bu bir UX/kalite/audit kapısıdır, kimlik/biyometrik doğrulama DEĞİLDİR.
import { useEffect, useRef, useState } from "react";
import { Button, colors, FONT } from "./Layout";
import { runCameraQualityCheck, MAX_GATE_ATTEMPTS } from "../utils/cameraQualityGate";

// Kısa, nazik, olgu bazlı uyarılar — "hile/kandırma" gibi niyet ifadesi YOK (ANA PRENSİP).
const FAIL_MESSAGES = {
  no_stream: "Kamera görüntüsü alınamıyor.",
  track_not_live: "Kamera bağlantısı kesilmiş görünüyor.",
  video_not_ready: "Kamera görüntüsü henüz hazır değil.",
  no_dimensions: "Kamera görüntüsü alınamıyor.",
  black_or_dark_image: "Kamera görüntünüz çok karanlık görünüyor.",
  frozen_video: "Kamera görüntüsü güncellenmiyor gibi görünüyor.",
  multiple_people: "Kamerada yalnızca bir kişi görünmelidir.",
  person_not_detected: "Kadrajda yüzünüz net şekilde görünmüyor.",
  detector_unavailable: "Kamera doğrulaması teknik bir nedenle tamamlanamıyor.",
  detector_timeout: "Kamera doğrulaması teknik bir nedenle tamamlanamıyor.",
  detector_error: "Kamera doğrulaması teknik bir nedenle tamamlanamıyor.",
};
const DEFAULT_MESSAGE = "Kamera görüntünüz şu an değerlendirilemiyor.";
// İş emri madde 9 — kısa uyarıdan sonra otomatik yeniden dener (kullanıcı tıklamasa BİLE ilerler);
// "Tekrar Kontrol Et" yalnız daha hızlı denemek isteyene kolaylıktır, zorunlu değildir.
const AUTO_RETRY_DELAY_MS = 1500;

/**
 * @param {object} props
 * @param {React.RefObject<HTMLVideoElement>} props.videoRef - zaten canlı stream gösteren video elementi
 * @param {(result: {status: "verified"|"unverified", reason: string, person_count: number|null,
 *   basic_video_ok: boolean, detector_available: boolean|null, timestamp: string,
 *   frameDataUrl: string|null, attempts: number}) => void} props.onComplete
 */
export default function CameraQualityGate({ videoRef, onComplete }) {
  const [phase, setPhase] = useState("checking"); // checking | retry
  const [message, setMessage] = useState("");
  const attemptRef = useRef(0);
  const runningRef = useRef(false);
  const completedRef = useRef(false);
  const retryTimerRef = useRef(null);

  const complete = (result) => {
    if (completedRef.current) return; // çift onComplete çağrısına karşı koruma
    completedRef.current = true;
    onComplete(result);
  };

  const runCheck = async () => {
    if (runningRef.current || completedRef.current) return;
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    runningRef.current = true;
    setPhase("checking");
    attemptRef.current += 1;
    try {
      const result = await runCameraQualityCheck(videoRef.current);
      if (result.status === "verified") {
        complete({ status: "verified", reason: result.reason, person_count: result.person_count,
                   basic_video_ok: result.basic_video_ok, detector_available: result.detector_available,
                   timestamp: result.timestamp, frameDataUrl: result.frameDataUrl, attempts: attemptRef.current });
        return;
      }
      // Ne HARD ne SOFT artık interview'u bloklar — ikisi de AYNI bounded deneme sayacını
      // paylaşır. Sayaç dolunca (madde 1/9/35) mülakat otomatik, sessizce UNVERIFIED ile devam eder.
      if (attemptRef.current >= MAX_GATE_ATTEMPTS) {
        complete({ status: "unverified", reason: result.reason, person_count: result.person_count,
                   basic_video_ok: result.basic_video_ok, detector_available: result.detector_available,
                   timestamp: result.timestamp, frameDataUrl: result.frameDataUrl, attempts: attemptRef.current });
        return;
      }
      setMessage(FAIL_MESSAGES[result.reason] || DEFAULT_MESSAGE);
      setPhase("retry");
      // Otomatik yeniden deneme — kullanıcı hiçbir şeye tıklamasa da kapı kendi kendine ilerler.
      retryTimerRef.current = setTimeout(runCheck, AUTO_RETRY_DELAY_MS);
    } catch (e) {
      // Kontrol fonksiyonunun kendisi beklenmedik şekilde reddederse dahi mülakat kilitlenmez.
      complete({ status: "unverified", reason: "check_exception", person_count: null,
                 basic_video_ok: null, detector_available: null,
                 timestamp: new Date().toISOString(), frameDataUrl: null, attempts: attemptRef.current });
    } finally {
      runningRef.current = false;
    }
  };

  useEffect(() => {
    runCheck();
    return () => { if (retryTimerRef.current) clearTimeout(retryTimerRef.current); };
    // eslint-disable-next-line
  }, []);

  const skipNow = () => {
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    complete({ status: "unverified", reason: "skipped_by_candidate", person_count: null,
               basic_video_ok: null, detector_available: null,
               timestamp: new Date().toISOString(), frameDataUrl: null, attempts: attemptRef.current });
  };

  return (
    <div style={{ textAlign: "center", padding: "16px 4px" }}>
      {phase === "checking" && (
        <div style={{ color: colors.muted, fontSize: 14, fontFamily: FONT }}>
          Kamera görüntünüz kontrol ediliyor…
        </div>
      )}
      {phase === "retry" && (
        <div>
          <div style={{ color: colors.muted, fontSize: 13.5, fontFamily: FONT, marginBottom: 12, lineHeight: 1.5 }}>
            {message}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <Button variant="primary" onClick={runCheck}>Tekrar Kontrol Et</Button>
            {/* İş emri madde 9/35 — kamera kontrolü hiçbir zaman zorunlu değildir; aday isterse
                beklemeden mülakata devam edebilir. */}
            <Button variant="secondary" onClick={skipNow}>Devam Et</Button>
          </div>
        </div>
      )}
    </div>
  );
}
