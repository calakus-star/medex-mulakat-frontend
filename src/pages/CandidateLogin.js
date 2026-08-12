import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { Header, Card, Input, Button, Alert, Icon, colors } from "../components/Layout";
import { API_URL } from "../App";

export default function CandidateLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const login = async () => {
    setLoading(true); setError("");
    try {
      const res = await axios.post(`${API_URL}/api/candidate/login`, { username, password });
      localStorage.setItem("candidate_token", res.data.token);
      localStorage.setItem("candidate_info", JSON.stringify(res.data.candidate));
      // L2: tamamen sesli (OpenAI Realtime) akış — ayrı sayfa. L1/L3: mevcut yazılı/hibrit akış.
      navigate(res.data.candidate?.level === 2 ? "/mulakat/sesli" : "/mulakat/baslat");
    } catch (e) {
      setError(e.response?.data?.detail || "Giriş başarısız");
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: colors.bg, display: "flex", flexDirection: "column", alignItems: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 420, marginTop: "8vh" }}>
        <Header subtitle="Mülakat Girişi" />
        <Card>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 10, background: colors.surfaceAlt, border: `1px solid ${colors.border}`,
              display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px",
            }}>
              <Icon name="users" size={20} color={colors.inkSoft} />
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, color: colors.ink }}>Aday Girişi</div>
            <div style={{ color: colors.muted, fontSize: 13.5, marginTop: 4 }}>Davet mailinizde gelen bilgileri girin</div>
          </div>
          {error && <Alert>{error}</Alert>}
          <Input label="Kullanıcı Adı" value={username} onChange={e => setUsername(e.target.value)} placeholder="kullanici_adi" />
          <Input label="Şifre" type="password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && login()} placeholder="••••••••" />
          <Button style={{ width: "100%", marginBottom: 16 }} disabled={loading || !username || !password} onClick={login}>
            {loading ? "Giriş yapılıyor..." : "Mülakata Gir"}
          </Button>
          <div style={{ textAlign: "center", color: colors.muted, fontSize: 13 }}>
            Davet almadınız mı?{" "}
            <Link to="/basvuru" style={{ color: colors.ink, fontWeight: 600 }}>Genel Başvuru</Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
