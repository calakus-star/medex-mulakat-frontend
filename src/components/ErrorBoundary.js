import { Component } from "react";
import { colors, FONT } from "./Layout";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("Beklenmeyen uygulama hatası:", error, info);
  }

  handleRetry = () => {
    // window.location.reload() tek başına da hasError'u sıfırlar (tam sayfa yenilemesi
    // tüm JS belleğini, bu bileşenin state'i dahil, sıfırdan kurar) — ama reload bir
    // tarayıcı API'si olduğu için React'in kendi state'ini AÇIKÇA sıfırlamıyor. Reload
    // herhangi bir nedenle (ör. ileride eklenecek bir beforeunload engeli) çalışmazsa
    // diye setState'i de açıkça çağırıyoruz.
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: colors.bg, fontFamily: FONT, padding: 24,
      }}>
        <div style={{
          maxWidth: 420, width: "100%", background: colors.surface, border: `1px solid ${colors.border}`,
          borderRadius: 12, padding: 28, textAlign: "center",
        }}>
          <div style={{ fontSize: 15.5, fontWeight: 700, color: colors.ink, marginBottom: 8 }}>
            Beklenmeyen bir hata oluştu
          </div>
          <div style={{ fontSize: 13, color: colors.muted, marginBottom: 20, lineHeight: 1.6 }}>
            Bu ekran yüklenirken bir sorun oluştu. Girdiğiniz veriler kaybolmamış olabilir; sayfayı
            yeniden yükleyerek devam edebilirsiniz.
          </div>
          <button
            onClick={this.handleRetry}
            style={{
              background: colors.ink, color: colors.surface, border: "none", borderRadius: 8,
              padding: "10px 20px", fontSize: 13.5, fontWeight: 600, fontFamily: FONT, cursor: "pointer",
            }}
          >
            Yeniden Dene
          </button>
        </div>
      </div>
    );
  }
}
