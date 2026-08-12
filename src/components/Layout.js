// Kurumsal/profesyonel tasarım sistemi — referans: sade, monokrom (siyah-beyaz), ince
// kenarlıklı kartlar, ikon+etiket düzeni, bol boşluk. Bu dosya tüm admin ve aday ekranları
// arasında paylaşıldığı için buradaki değişiklikler tüm uygulamaya otomatik yayılır.
// Interview.js de artık kendi paletini değil, doğrudan buradaki `colors`'ı kullanır.

export const colors = {
  ink: "#111113",
  inkSoft: "#3f3f46",
  muted: "#71717a",
  mutedLight: "#a1a1aa",
  border: "#e4e4e7",
  borderStrong: "#d4d4d8",
  bg: "#f7f7f8",
  surface: "#ffffff",
  surfaceAlt: "#fafafa",
  accent: "#111113",

  green: "#16a34a", greenBg: "#f0fdf4", greenBorder: "#bbf7d0",
  yellow: "#d97706", yellowBg: "#fffbeb", yellowBorder: "#fde68a",
  red: "#dc2626", redBg: "#fef2f2", redBorder: "#fecaca",
  blue: "#2563eb", blueBg: "#eff6ff", blueBorder: "#bfdbfe",
  purple: "#7c3aed", purpleBg: "#faf5ff", purpleBorder: "#e9d5ff",

  // Geriye dönük uyumluluk: Interview.js aynı anahtar isimleriyle bu paleti kullanır.
  navy: "#111113", navyLight: "#3f3f46", slate: "#71717a", white: "#ffffff",
};

export const FONT = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif";

export function Header({ subtitle, badge = "AI Mülakat Sistemi" }) {
  return (
    <div style={{
      background: colors.surface, border: `1px solid ${colors.border}`, padding: "16px 22px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      borderRadius: 12, marginBottom: 18, fontFamily: FONT, flexWrap: "wrap", gap: 10,
    }}>
      <div>
        <div style={{ color: colors.mutedLight, fontSize: 11, fontWeight: 600, letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 4 }}>
          MedeX SMO
        </div>
        <div style={{ color: colors.ink, fontSize: 17, fontWeight: 600 }}>{subtitle}</div>
      </div>
      {badge && (
        <div style={{ background: colors.surfaceAlt, border: `1px solid ${colors.border}`, borderRadius: 20, padding: "6px 14px" }}>
          <span style={{ color: colors.inkSoft, fontSize: 12, fontWeight: 600 }}>{badge}</span>
        </div>
      )}
    </div>
  );
}

export function Card({ children, style = {} }) {
  return (
    <div style={{
      background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 22,
      boxShadow: "0 1px 2px rgba(15,23,42,0.03)", fontFamily: FONT, ...style
    }}>
      {children}
    </div>
  );
}

export function Input({ label, ...props }) {
  return (
    <div style={{ marginBottom: 16, fontFamily: FONT }}>
      {label && <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: colors.inkSoft, marginBottom: 6 }}>{label}</label>}
      <input
        style={{
          width: "100%", padding: "10px 13px", borderRadius: 8,
          border: `1px solid ${colors.border}`, fontSize: 14, outline: "none",
          fontFamily: FONT, transition: "border-color 0.15s, box-shadow 0.15s",
          boxSizing: "border-box", color: colors.ink,
        }}
        onFocus={e => { e.target.style.borderColor = colors.ink; e.target.style.boxShadow = `0 0 0 3px rgba(17,17,19,0.08)`; }}
        onBlur={e => { e.target.style.borderColor = colors.border; e.target.style.boxShadow = "none"; }}
        {...props}
      />
    </div>
  );
}

export function Select({ label, options = [], ...props }) {
  return (
    <div style={{ marginBottom: 16, fontFamily: FONT }}>
      {label && <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: colors.inkSoft, marginBottom: 6 }}>{label}</label>}
      <select
        style={{
          width: "100%", padding: "10px 13px", borderRadius: 8,
          border: `1px solid ${colors.border}`, fontSize: 14, outline: "none",
          fontFamily: FONT, background: colors.surface, cursor: "pointer",
          boxSizing: "border-box", color: colors.ink,
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

export function Textarea({ label, hint, ...props }) {
  return (
    <div style={{ marginBottom: 16, fontFamily: FONT }}>
      {label && <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: colors.inkSoft, marginBottom: 6 }}>{label}</label>}
      <textarea
        style={{
          width: "100%", padding: "10px 13px", borderRadius: 8,
          border: `1px solid ${colors.border}`, fontSize: 14, outline: "none",
          fontFamily: FONT, resize: "vertical", boxSizing: "border-box", color: colors.ink,
        }}
        {...props}
      />
      {hint && <div style={{ fontSize: 11.5, color: colors.muted, marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

export function Button({ children, variant = "primary", disabled, style = {}, ...props }) {
  const styles = {
    primary: { bg: colors.accent, color: "#fff", border: "1px solid " + colors.accent },
    secondary: { bg: colors.surface, color: colors.ink, border: `1px solid ${colors.border}` },
    danger: { bg: colors.surface, color: colors.red, border: `1px solid ${colors.redBorder}` },
  };
  const s = disabled
    ? { bg: colors.surfaceAlt, color: colors.mutedLight, border: `1px solid ${colors.border}` }
    : (styles[variant] || styles.primary);
  return (
    <button
      disabled={disabled}
      style={{
        background: s.bg, color: s.color, border: s.border, borderRadius: 8,
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

// Küçük aksiyon butonu — metnin başına emoji eklemek çağıran tarafın işi.
export function ChipButton({ children, tone = "neutral", style = {}, ...props }) {
  const tones = {
    neutral: { bg: colors.surfaceAlt, color: colors.inkSoft },
    blue: { bg: colors.blueBg, color: colors.blue },
    green: { bg: colors.greenBg, color: colors.green },
    yellow: { bg: colors.yellowBg, color: colors.yellow },
    red: { bg: colors.redBg, color: colors.red },
    purple: { bg: colors.purpleBg, color: colors.purple },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <button
      style={{
        background: t.bg, color: t.color, border: "none", borderRadius: 6,
        padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer",
        fontFamily: FONT, ...style
      }}
      {...props}
    >
      {children}
    </button>
  );
}

export function Badge({ children, tone = "neutral" }) {
  const tones = {
    neutral: { bg: colors.surfaceAlt, color: colors.inkSoft },
    blue: { bg: colors.blueBg, color: colors.blue },
    green: { bg: colors.greenBg, color: colors.green },
    yellow: { bg: colors.yellowBg, color: colors.yellow },
    red: { bg: colors.redBg, color: colors.red },
    purple: { bg: colors.purpleBg, color: colors.purple },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span style={{ fontSize: 11.5, background: t.bg, color: t.color, padding: "3px 9px", borderRadius: 20, fontWeight: 600, fontFamily: FONT, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

export function Alert({ type = "error", children }) {
  const config = {
    error: { bg: colors.redBg, border: colors.redBorder, color: colors.red },
    success: { bg: colors.greenBg, border: colors.greenBorder, color: colors.green },
    warning: { bg: colors.yellowBg, border: colors.yellowBorder, color: colors.yellow },
  };
  const c = config[type] || config.error;
  return (
    <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 16, color: c.color, fontSize: 13.5, fontFamily: FONT, lineHeight: 1.5 }}>
      {children}
    </div>
  );
}

// ---- Avatar: isim baş harfi, isme göre tutarlı bir tonda daire ----
const AVATAR_TONES = [
  { bg: "#dbeafe", color: "#1d4ed8" }, { bg: "#dcfce7", color: "#15803d" },
  { bg: "#fef3c7", color: "#b45309" }, { bg: "#fce7f3", color: "#be185d" },
  { bg: "#ede9fe", color: "#6d28d9" }, { bg: "#e0f2fe", color: "#0369a1" },
];
export function Avatar({ name, size = 38 }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const tone = AVATAR_TONES[hash % AVATAR_TONES.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: tone.bg, color: tone.color,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 700, fontSize: size * 0.42, fontFamily: FONT, flexShrink: 0,
    }}>
      {initial}
    </div>
  );
}

// ---- Filtre çipi: aktif/pasif pill buton (referans görseldeki "Tümü 12" tarzı) ----
export function FilterChip({ children, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? colors.accent : colors.surface,
        color: active ? "#fff" : colors.inkSoft,
        border: active ? "1px solid " + colors.accent : `1px solid ${colors.border}`,
        borderRadius: 20, padding: "6px 14px", fontSize: 12.5, fontWeight: 600,
        cursor: "pointer", fontFamily: FONT,
      }}
    >
      {children}
    </button>
  );
}

// ---- Stat kartı: sayı + etiket, referans görseldeki sade kart hissi ----
export function StatTile({ label, value }) {
  return (
    <Card style={{ padding: 16, textAlign: "center" }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: colors.ink, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>{label}</div>
    </Card>
  );
}

// ---- Sekmeler: AdminDashboard'daki elle yazılmış tab butonlarının paylaşımlı hali ----
export function Tabs({ items, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
      {items.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          style={{
            background: active === t.key ? colors.accent : colors.surface,
            color: active === t.key ? "#fff" : colors.ink,
            border: active === t.key ? "1px solid " + colors.accent : `1px solid ${colors.border}`,
            borderRadius: 8, padding: "9px 18px", fontSize: 13.5, fontWeight: 600,
            cursor: "pointer", fontFamily: FONT,
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---- Tablo: kenarlıklı, tutarlı başlık/satır stiliyle, kendi yatay-scroll sarmalayıcısıyla ----
export function Table({ columns, children }) {
  return (
    <div style={{ overflowX: "auto", border: `1px solid ${colors.border}`, borderRadius: 10 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, fontFamily: FONT, minWidth: 720 }}>
        <thead>
          <tr style={{ background: colors.surfaceAlt }}>
            {columns.map(h => (
              <th key={h} style={{ padding: "11px 12px", textAlign: "left", color: colors.inkSoft, fontWeight: 600, borderBottom: `1px solid ${colors.border}`, whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

// ---- Modal: overlay + panel sarmalayıcı, AdminDashboard'daki tekrar eden inline modal JSX yerine ----
export function Modal({ children, onClose, maxWidth = 700 }) {
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(17,17,19,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}
    >
      <div onClick={e => e.stopPropagation()} style={{ background: colors.surface, borderRadius: 12, padding: 28, maxWidth, width: "100%", maxHeight: "85vh", overflowY: "auto", fontFamily: FONT }}>
        {children}
      </div>
    </div>
  );
}
