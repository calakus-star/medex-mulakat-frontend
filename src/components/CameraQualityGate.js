// İş emri — MÜLAKAT ÖNCESİ KAMERA KALİTE KAPISI
// L1 (Interview.js) ve L2/L3 (RealtimeInterview.js) TARAFINDAN ORTAK kullanılan doğrulama
// ekranı. Mantık cameraQualityGate.js'te (tek modül); bu bileşen yalnız deneme sayacını,
// HARD/SOFT FAIL akışını ve kullanıcıya gösterilecek metni yönetir — kod ekranlar arasında
// KOPYALANMAZ (iş emri madde 2).
//
// GÜVENLİK SINIRI: bu bir UX/kalite kapısıdır, kimlik/biyometrik doğrulama DEĞİLDİR.
import { useEffect, useRef, useState } from "react";
import { Button, colors, FONT } from "./Layout";
import { runCameraQualityCheck, MAX_SOFT_ATTEMPTS } from "../utils/cameraQualityGate";

const HARD_FAIL_MESSAGES = {
  no_stream: "Kamera görüntüsü alınamıyor. Lütfen kameranızın başka bir uygulama tarafından kullanılmadığından emin olun ve tekrar deneyin.",
  track_not_live: "Kamera bağlantısı kesilmiş görünüyor. Lütfen tekrar deneyin.",
  video_not_ready: "Kamera görüntüsü henüz hazır değil. Lütfen birkaç saniye bekleyip tekrar deneyin.",
  no_dimensions: "Kamera görüntüsü alınamıyor. Lütfen kameranızı kontrol edip tekrar deneyin.",
  black_or_dark_image: "Kamera görüntüsü çok karanlık veya kapalı görünüyor. Lütfen lens kapağını/kapatıcıyı kontrol edin, ortamınızı aydınlatın ve tekrar deneyin.",
  frozen_video: "Kamera görüntüsü donmuş görünüyor. Lütfen kameranızı kontrol edip tekrar deneyin.",
  multiple_people: "Görüntüde birden fazla kişi tespit edildi. Lütfen mülakatı yalnız kendiniz, kadrajda yalnız siz olacak şekilde gerçekleştirin.",
};

const SOFT_FAIL_MESSAGE = "Kadrajda yüzünüz net şekilde görünmüyor. Lütfen kameraya biraz daha yaklaşın, ışığı iyileştirin ve tekrar deneyin.";

/**
 * @param {object} props
 * @param {React.RefObject<HTMLVideoElement>} props.videoRef - zaten canlı stream gösteren video elementi
 * @param {(result: {status: "verified"|"unverified", reason: string, person_count: number|null,
 *   basic_video_ok: boolean, detector_available: boolean|null, timestamp: string,
 *   frameDataUrl: string|null, attempts: number}) => void} props.onComplete
 */
export default function CameraQualityGate({ videoRef, onComplete }) {
  const [phase, setPhase] = useState("checking"); // checking | hard_fail | soft_retry
  const [message, setMessage] = useState("");
  const attemptRef = useRef(0);
  const softAttemptsRef = useRef(0);
  const runningRef = useRef(false);

  const runCheck = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setPhase("checking");
    attemptRef.current += 1;
    try {
      const result = await runCameraQualityCheck(videoRef.current);
      if (result.status === "verified") {
        onComplete({ status: "verified", reason: result.reason, person_count: result.person_count,
                     basic_video_ok: result.basic_video_ok, detector_available: result.detector_available,
                     timestamp: result.timestamp, frameDataUrl: result.frameDataUrl, attempts: attemptRef.current });
        return;
      }
      if (result.hard) {
        // İş emri madde 10/11: HARD FAIL'de 3 deneme sınırı YOK, otomatik geçiş YOK —
        // yalnız manuel "Tekrar Kontrol Et" ile devam edilebilir.
        setMessage(HARD_FAIL_MESSAGES[result.reason] || "Kamera görüntüsü kullanılamıyor. Lütfen kontrol edip tekrar deneyin.");
        setPhase("hard_fail");
        return;
      }
      // SOFT FAIL (detector_unavailable/detector_error/person_not_detected)
      softAttemptsRef.current += 1;
      if (softAttemptsRef.current >= MAX_SOFT_ATTEMPTS) {
        // İş emri madde 9/10: 3. soft-fail sonrası, temel kamera kalitesi PASS ise
        // UNVERIFIED ile devam — adaya alarm gösterilmez, sessizce ilerler (UNVERIFIED/VERIFIED
        // ayrımı yalnız admin tarafında anlamlıdır, madde 14).
        onComplete({ status: "unverified", reason: result.reason, person_count: result.person_count,
                     basic_video_ok: result.basic_video_ok, detector_available: result.detector_available,
                     timestamp: result.timestamp, frameDataUrl: result.frameDataUrl, attempts: attemptRef.current });
        return;
      }
      setMessage(SOFT_FAIL_MESSAGE);
      setPhase("soft_retry");
    } finally {
      runningRef.current = false;
    }
  };

  useEffect(() => {
    runCheck();
  }, []);

  return (
    <div style={{ textAlign: "center", padding: "16px 4px" }}>
      {phase === "checking" && (
        <div style={{ color: colors.muted, fontSize: 14, fontFamily: FONT }}>
          Kamera görüntünüz kontrol ediliyor…
        </div>
      )}
      {(phase === "hard_fail" || phase === "soft_retry") && (
        <div>
          <div style={{ color: phase === "hard_fail" ? colors.red : colors.muted, fontSize: 13.5, fontFamily: FONT, marginBottom: 12, lineHeight: 1.5 }}>
            {message}
          </div>
          <Button variant="primary" onClick={runCheck}>Tekrar Kontrol Et</Button>
        </div>
      )}
    </div>
  );
}
