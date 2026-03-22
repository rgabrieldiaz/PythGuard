import { useState, useEffect, useRef, useCallback } from "react";
import { Bell } from "lucide-react";
import PriceChart from "./components/PriceChart";
import SafetyIndicator from "./components/SafetyIndicator";
import SlippagePanel from "./components/SlippagePanel";
import AuthModal from "./components/AuthModal";
import { supabase, Profile } from "./lib/supabase";

// ============================================================
// TIPOS
// ============================================================

export interface PriceDataPoint {
  time: string;
  price: number;
  timestamp: number;
}

export interface AppState {
  currentPrice: number;
  stopLossThreshold: number;
  isStopLossTriggered: boolean;
  priceHistory: PriceDataPoint[];
  lastUpdateMs: number;
  updateCount: number;
}

// ============================================================
// CONSTANTES
// ============================================================

const STOP_LOSS_THRESHOLD = 0.35;
const UPDATE_INTERVAL_MS = 400;
const HISTORY_WINDOW = 60;
const DEX_DELAY_MS = 2000;

// ============================================================
// MOCK DE PRECIO ADA/USD
// ============================================================

function generateMockPrice(prev: number, threshold: number): number {
  const t = Date.now() / 10000;
  const sine  = Math.sin(t * 0.7) * 0.045;
  const noise = (Math.random() - 0.5) * 0.004;
  const flashCrash = Math.random() < 0.015 ? -(threshold * 0.12) : 0;
  const next = Math.max(0.28, Math.min(0.48, prev + sine * 0.03 + noise + flashCrash));
  return parseFloat(next.toFixed(6));
}

// ============================================================
// APP COMPONENT
// ============================================================

export default function App() {
  // — Price feed state —
  const [state, setState] = useState<AppState>({
    currentPrice: 0.3820,
    stopLossThreshold: STOP_LOSS_THRESHOLD,
    isStopLossTriggered: false,
    priceHistory: [],
    lastUpdateMs: Date.now(),
    updateCount: 0,
  });
  const dexPriceRef = useRef<number>(0.3820);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // — Auth state —
  const [authOpen, setAuthOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hasNotification] = useState(true); // Demo: always show red dot

  // Listen for auth state
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await fetchProfile(session.user.id);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (data) setProfile(data as Profile);
  };

  // — Pyth feed —
  const tick = useCallback(() => {
    setState((prev) => {
      const newPrice = generateMockPrice(prev.currentPrice, prev.stopLossThreshold);
      const now     = Date.now();
      const point: PriceDataPoint = {
        time: new Date(now).toLocaleTimeString("es-AR", { hour12: false }),
        price: newPrice,
        timestamp: now,
      };
      const newHistory = [...prev.priceHistory, point].slice(-HISTORY_WINDOW);
      const triggered  = newPrice <= prev.stopLossThreshold;
      return { ...prev, currentPrice: newPrice, isStopLossTriggered: triggered, priceHistory: newHistory, lastUpdateMs: now, updateCount: prev.updateCount + 1 };
    });
    setTimeout(() => {
      setState((curr) => { dexPriceRef.current = curr.currentPrice; return curr; });
    }, DEX_DELAY_MS);
  }, []);

  useEffect(() => {
    const initial: PriceDataPoint[] = Array.from({ length: 30 }, (_, i) => {
      const t = Date.now() - (30 - i) * UPDATE_INTERVAL_MS;
      return { time: new Date(t).toLocaleTimeString("es-AR", { hour12: false }), price: 0.382 + (Math.random() - 0.5) * 0.03, timestamp: t };
    });
    setState((s) => ({ ...s, priceHistory: initial }));
    intervalRef.current = setInterval(tick, UPDATE_INTERVAL_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [tick]);

  // — Profile avatar for header —
  const profileAvatar = profile?.avatar_url ?? null;
  const displayName = profile?.full_name?.split(" ")[0] ?? "PythGuard Operator";

  return (
    <div className="container" style={{ minHeight: "100vh" }}>
      {/* ── Auth Modal ── */}
      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onProfileSaved={(p) => setProfile(p)}
        existingProfile={profile}
      />

      {/* ── Editorial Header ── */}
      <header style={{ marginBottom: "3rem", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <span className="text-muted" style={{ letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700 }}>
            Curated Security Feed
          </span>
          <h1 className="title-md" style={{ marginTop: "0.5rem", color: "var(--on-background)" }}>
            Welcome back, <span style={{ color: "var(--primary)" }}>{displayName}</span>
          </h1>
          <p className="text-muted" style={{ marginTop: "0.5rem", fontSize: "1rem" }}>
            Here is what is happening with your guarded assets today.
          </p>
        </div>
        
        <div style={{ display: "flex", gap: "2rem", alignItems: "center" }}>
          <div style={{ textAlign: "right" }}>
            <p className="text-muted" style={{ marginBottom: "0.2rem" }}>Feed Latency</p>
            <p style={{ fontFamily: "var(--font-editorial)", fontSize: "1.25rem", color: "var(--primary)", fontWeight: 700 }}>~400ms</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p className="text-muted" style={{ marginBottom: "0.2rem" }}>Live Updates</p>
            <p style={{ fontFamily: "var(--font-editorial)", fontSize: "1.25rem", color: "var(--on-background)", fontWeight: 700 }}>
              {state.updateCount.toLocaleString()}
            </p>
          </div>
          <button className="btn-primary">Pyth Lazer Live</button>

          {/* Header: Notifications + Profile */}
          <div style={{ display: "flex", gap: "1rem", alignItems: "center", borderLeft: "1px solid var(--surface-container)", paddingLeft: "2rem" }}>
            {/* Notifications — Lucide Bell */}
            <button className="notification-btn" aria-label="Notifications">
              <Bell size={20} color="var(--on-background)" strokeWidth={2} />
              {hasNotification && <span className="notification-dot"></span>}
            </button>

            {/* Profile picture — opens AuthModal */}
            <button
              onClick={() => setAuthOpen(true)}
              aria-label="Perfil de usuario"
              style={{ padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
            >
              {profileAvatar ? (
                <img
                  src={profileAvatar}
                  alt="Operator Profile"
                  className="profile-pic"
                  style={{ border: "2.5px solid var(--primary-container)" }}
                />
              ) : (
                <div
                  className="profile-pic"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--secondary-container)",
                    border: "2.5px solid var(--primary-container)",
                  }}
                >
                  <span style={{ fontSize: "1.25rem" }}>👤</span>
                </div>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Dashboard Grid ── */}
      <main style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "2.5rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
          {/* Hero Price Card */}
          <div className="curator-card" style={{ background: "var(--surface-container-low)" }}>
            <p className="text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: "1.5rem" }}>
              ADA / USD — Live Market Value
            </p>
            <div style={{ display: "flex", alignItems: "baseline", gap: "1rem" }}>
              <h2 className="title-lg" style={{ color: state.isStopLossTriggered ? "var(--error)" : "var(--primary)" }}>
                ${state.currentPrice.toFixed(6)}
              </h2>
              <span className="text-muted" style={{ fontSize: "1.25rem" }}>USD</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "2rem", marginTop: "2.5rem" }}>
              <div>
                <p className="text-muted" style={{ marginBottom: "0.5rem" }}>Stop-Loss Threshold</p>
                <p style={{ fontWeight: 700, fontSize: "1.25rem" }}>${state.stopLossThreshold.toFixed(6)}</p>
              </div>
              <div>
                <p className="text-muted" style={{ marginBottom: "0.5rem" }}>Market Margin</p>
                <p style={{ fontWeight: 700, fontSize: "1.25rem", color: state.currentPrice > state.stopLossThreshold ? "var(--primary)" : "var(--error)" }}>
                  {state.currentPrice > state.stopLossThreshold ? "+" : ""}
                  {(((state.currentPrice - state.stopLossThreshold) / state.stopLossThreshold) * 100).toFixed(2)}%
                </p>
              </div>
              <div>
                <p className="text-muted" style={{ marginBottom: "0.5rem" }}>Network Node</p>
                <p style={{ fontWeight: 700, fontSize: "1.25rem" }}>PreProd</p>
              </div>
            </div>
          </div>

          <PriceChart data={state.priceHistory} threshold={state.stopLossThreshold} isTriggered={state.isStopLossTriggered} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
          <SafetyIndicator isStopLossTriggered={state.isStopLossTriggered} currentPrice={state.currentPrice} threshold={state.stopLossThreshold} />
          <SlippagePanel pythPrice={state.currentPrice} dexPriceRef={dexPriceRef} isTriggered={state.isStopLossTriggered} />
        </div>
      </main>

      {/* ── Footer ── */}
      <footer style={{ marginTop: "4rem", borderTop: "1px solid var(--surface-container)", paddingTop: "2rem", paddingBottom: "3rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p className="text-muted">© 2024 PythGuard. Financial Artistry & Security.</p>
          <p className="text-muted">
            Policy ID: <span style={{ fontFamily: "monospace", color: "var(--primary)" }}>d799d287...800a21e6</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
