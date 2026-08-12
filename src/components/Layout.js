// Kurumsal/profesyonel tasarım sistemi — OpenAI/Apple/Linear estetiğine yakın:
// ince kenarlıklar, hafif gölgeler, bol boşluk, sade renk paleti. Bu dosya
// AdminDashboard, PositionManager ve WalkinPanel arasında paylaşıldığı için
// buradaki değişiklikler tüm admin paneline otomatik yayılır.

export const colors = {
  navy: "#0f172a",
  navyLight: "#1e293b",
  blue: "#3b82f6",
  bg: "#fafbfc",
  white: "#ffffff",
  slate: "#64748b",
  border: "#e5e8ec",
  green: "#16a34a",
  yellow: "#d97706",
  red: "#dc2626",
};

const FONT = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif";

export function Header({ subtitle }) {
  return (
    <div style={{
      background: colors.white, border: `1px solid ${colors.border}`, padding: "18px 26px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      borderRadius: 14, marginBottom: 20, fontFamily: FONT,
    }}>
      <div>
        <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600, letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 4 }}>
          MedeX SMO
        </div>
        <div style={{ color: colors.navy, fontSize: 17, fontWeight: 600 }}>{subtitle}</div>
      </div>
      <div style={{ background: "#f1f5f9", borderRadius: 20, padding: "6px 14px" }}>
        <span style={{ color: "#475569", fontSize: 12, fontWeight: 600 }}>AI Mülakat Sistemi</span>
      </div>
    </div>
  );
}

export function Card({ children, style = {} }) {
  return (
    <div style={{
      background: colors.white, border: `1px solid ${colors.border}`, borderRadius: 14, padding: 24,
      boxShadow: "0 1px 2px rgba(15,23,42,0.03)", fontFamily: FONT, ...style
    }}>
      {children}
    </div>
  );
}

export function Input({ label, ...props }) {
  return (
    <div style={{ marginBottom: 16, fontFamily: FONT }}>
      {label && <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#334155", marginBottom: 6 }}>{label}</label>}
      <input
        style={{
          width: "100%", padding: "10px 13px", borderRadius: 8,
          border: `1px solid ${colors.border}`, fontSize: 14, outline: "none",
          fontFamily: FONT, transition: "border-color 0.15s, box-shadow 0.15s",
          boxSizing: "border-box", color: colors.navy,
        }}
        onFocus={e => { e.target.style.borderColor = colors.blue; e.target.style.boxShadow = `0 0 0 3px ${colors.blue}1a`; }}
        onBlur={e => { e.target.style.borderColor = colors.border; e.target.style.boxShadow = "none"; }}
        {...props}
      />
    </div>
  );
}

export function Select({ label, options = [], ...props }) {
  return (
    <div style={{ marginBottom: 16, fontFamily: FONT }}>
      {label && <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#334155", marginBottom: 6 }}>{label}</label>}
      <select
        style={{
          width: "100%", padding: "10px 13px", borderRadius: 8,
          border: `1px solid ${colors.border}`, fontSize: 14, outline: "none",
          fontFamily: FONT, background: "#fff", cursor: "pointer",
          boxSizing: "border-box", color: colors.navy,
        }}
        {...props}
      >
        <option value="">Seçiniz...</option>
        {options.map(o => o.options ? (
          <optgroup key={o.label} label={o.label}>
            {o.options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </optgroup>
        ) : <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function Button({ children, variant = "primary", disabled, style = {}, ...props }) {
  const styles = {
    primary: { bg: colors.navy, color: "#fff", border: "none" },
    secondary: { bg: "#fff", color: colors.navy, border: `1px solid ${colors.border}` },
    danger: { bg: "#fff", color: colors.red, border: `1px solid #fecaca` },
  };
  const s = disabled
    ? { bg: "#f1f5f9", color: "#94a3b8", border: `1px solid ${colors.border}` }
    : (styles[variant] || styles.primary);
  return (
    <button
      disabled={disabled}
      style={{
        background: s.bg, color: s.color, border: s.border, borderRadius: 9,
        padding: "10px 20px", fontSize: 13.5, fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer", fontFamily: FONT,
        transition: "opacity 0.15s, background 0.15s", ...style
      }}
      {...props}
    >
      {children}
    </button>
  );
}

export function Alert({ type = "error", children }) {
  const config = {
    error: { bg: "#fef2f2", border: "#fecaca", color: colors.red },
    success: { bg: "#f0fdf4", border: "#bbf7d0", color: colors.green },
    warning: { bg: "#fffbeb", border: "#fde68a", color: colors.yellow },
  };
  const c = config[type] || config.error;
  return (
    <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 16, color: c.color, fontSize: 13.5, fontFamily: FONT, lineHeight: 1.5 }}>
      {children}
    </div>
  );
}
