import axios from "axios";

// Hata yönetimi standardı (CLAUDE.md, Aşama 4): timeout, hata dönüşümü ve kullanıcı mesajı TEK
// yerde. Her sayfa kendi timeout/hata-formatlama mantığını tekrar yazmaz.
//
// NOT: RealtimeInterview.js (Level 2/3 sesli mülakat, WebRTC) bilerek bu istemciye taşınmadı —
// CLAUDE.md kuralı gereği ses/WebRTC hattına ayrı ve açık onay olmadan dokunulmuyor.

const apiClient = axios.create({ timeout: 20000 });

const LOGIN_PATHS = ["/api/admin/login", "/api/candidate/login"];
const ADMIN_URL_PREFIXES = ["/api/admin/", "/api/superadmin/"];

const isAdminUrl = (url) => ADMIN_URL_PREFIXES.some((p) => url.includes(p));

apiClient.interceptors.response.use(
  (res) => res,
  (error) => {
    const url = error?.config?.url || "";
    const status = error?.response?.status;
    const isLoginCall = LOGIN_PATHS.some((p) => url.includes(p));

    // Login uç noktasının kendi 401'i (yanlış şifre) bir oturum geçersizliği değildir —
    // bu istisna korunuyor, aşağıdaki davranışlardan hiçbiri tetiklenmiyor.
    if (status === 401 && !isLoginCall) {
      if (isAdminUrl(url)) {
        // ADMIN YÜZEYİ: yönlendirme kalıyor ama SESSİZCE olmuyor — kullanıcı OK'layana kadar
        // JS'i durduran bir uyarı önce gösteriliyor, sonra token temizlenip login'e dönülüyor.
        window.alert("Oturumunuz sona erdi, tekrar giriş yapmanız gerekiyor.");
        localStorage.removeItem("admin_token");
        if (window.location.pathname !== "/admin") window.location.href = "/admin";
      } else {
        // ADAY YÜZEYİ (mülakat, aday girişi, başvuru): mülakat ortasında adayı login'e atmak
        // KABUL EDİLEMEZ — otomatik yönlendirme veya token temizleme YOK. Sadece hata olarak
        // dönüyor; formatApiError bunu adaya nazik, Türkçe bir mesajla gösterir (ham kod/
        // İngilizce metin asla ekrana düşmez).
        error.userMessage = "Bağlantı yenileniyor, lütfen bekleyin.";
      }
    }
    return Promise.reject(error);
  }
);

// FastAPI'nin 422 validasyon hatası detail'i dizi, diğerleri string döner — ikisini de
// okunabilir tek bir mesaja çevirir. Zaman aşımını (ECONNABORTED) ayrı bir bayrakla işaretler
// çünkü bu durumda backend işlemi TAMAMLAMIŞ OLABİLİR — "başarısız" demek yanlış bilgi olur.
export function formatApiError(e, fallback = "Bir hata oluştu, lütfen tekrar deneyin.") {
  // Interceptor'ın aday-yüzeyi 401'i için ürettiği nazik mesaj — her zaman öncelikli.
  if (e?.userMessage) return { message: e.userMessage, timeout: false };
  if (e?.code === "ECONNABORTED") {
    return { message: "Sunucudan yanıt gelmedi, işlemin durumu bilinmiyor.", timeout: true };
  }
  const detail = e?.response?.data?.detail;
  if (typeof detail === "string") return { message: detail, timeout: false };
  if (Array.isArray(detail)) {
    const message = detail
      .map((d) => {
        const field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : "alan";
        return `${field}: ${d.msg || "geçersiz değer"}`;
      })
      .join("; ");
    return { message, timeout: false };
  }
  return { message: fallback, timeout: false };
}

export default apiClient;
