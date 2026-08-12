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

// ---- İkonlar: emoji yerine sade çizgi ikonlar (bağımlılık eklemeden, inline SVG) ----
const ICON_PATHS = {
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  users: "M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M11 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  briefcase: "M20 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2ZM16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2",
  check: "M20 6 9 17l-5-5",
  plus: "M12 5v14M5 12h14",
  close: "M18 6 6 18M6 6l18 12",
  edit: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z",
  trash: "M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z",
  eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  refresh: "M21 2v6h-6M3 22v-6h6M2.5 9.5A9 9 0 0 1 20 7l1 1M21.5 14.5A9 9 0 0 1 4 17l-1-1",
  key: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777Zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3-3.5 3.5Zm0 0L19 4",
  history: "M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8M12 7v5l4 2",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.35-4.35",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6",
  sparkle: "M12 3v4M12 17v4M5 12H3M8 8 5.5 5.5M16 8l2.5-2.5M8 16l-2.5 2.5M16 16l2.5 2.5M21 12h-2",
  chevronDown: "M6 9l6 6 6-6",
  building: "M3 21h18M6 21V8l6-4 6 4v13M9 21v-6h6v6M9 12h.01M15 12h.01M9 8h.01M15 8h.01",
};

export function Icon({ name, size = 16, color = "currentColor", style = {} }) {
  const d = ICON_PATHS[name];
  if (!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, ...style }}>
      <path d={d} />
    </svg>
  );
}

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

// Küçük, ikon niyetine kullanılan aksiyon butonu — emoji yerine.
export function ChipButton({ children, iconName, tone = "neutral", style = {}, ...props }) {
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
        fontFamily: FONT, display: "inline-flex", alignItems: "center", gap: 5, ...style
      }}
      {...props}
    >
      {iconName && <Icon name={iconName} size={13} />}
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

// ---- Stat kartı: sayı + etiket, referans görseldeki sade kart hissi ----
export function StatTile({ label, value, iconName }) {
  return (
    <Card style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
      {iconName && (
        <div style={{ width: 36, height: 36, borderRadius: 8, background: colors.surfaceAlt, border: `1px solid ${colors.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon name={iconName} size={17} color={colors.inkSoft} />
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: colors.ink, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{label}</div>
      </div>
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
            cursor: "pointer", fontFamily: FONT, display: "inline-flex", alignItems: "center", gap: 6,
          }}
        >
          {t.iconName && <Icon name={t.iconName} size={14} />}
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
