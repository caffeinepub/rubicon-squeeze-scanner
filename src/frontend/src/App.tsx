import { Toaster } from "@/components/ui/sonner";
import { Activity, BarChart3, Loader2, TrendingUp, Zap } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { CryptoSignal } from "./backend.d";
import { useActor } from "./hooks/useActor";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(price: number): string {
  if (price >= 1000)
    return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(6)}`;
}

function formatVolume(vol: number): string {
  if (vol >= 1_000_000_000) return `$${(vol / 1_000_000_000).toFixed(2)}B`;
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(2)}M`;
  return `$${vol.toLocaleString("en-US")}`;
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  accent?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: "#141A22",
        border: "1px solid #2A313C",
        borderRadius: 12,
        padding: "20px 24px",
        flex: 1,
        minWidth: 160,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 10,
        }}
      >
        <Icon size={16} style={{ color: accent ?? "#9AA4B2" }} />
        <span
          style={{
            color: "#9AA4B2",
            fontSize: 12,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{ color: accent ?? "#E9EEF6", fontSize: 32, fontWeight: 700 }}
      >
        {value}
      </div>
    </motion.div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const { actor, isFetching: actorLoading } = useActor();
  const [signals, setSignals] = useState<CryptoSignal[]>([]);
  const [scanning, setScanning] = useState(false);
  const [lastScanned, setLastScanned] = useState<Date | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [, setTick] = useState(0);

  // refresh "X ago" every 30s
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Load cached signals on mount
  useEffect(() => {
    if (!actor || actorLoading) return;
    actor
      .getAllSignals()
      .then((data) => {
        if (data.length > 0) {
          setSignals(data);
          setLastScanned(new Date());
        }
        setInitialized(true);
      })
      .catch(() => setInitialized(true));
  }, [actor, actorLoading]);

  const handleScan = useCallback(async () => {
    setScanning(true);
    try {
      // Step 1: Fetch top 20 coins by volume
      const marketsRes = await fetch(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=volume_desc&per_page=20&page=1",
      );
      if (!marketsRes.ok) throw new Error("Failed to fetch markets");
      const markets: Array<{
        id: string;
        symbol: string;
        name: string;
        current_price: number;
        total_volume: number;
        price_change_percentage_24h: number;
        high_24h: number;
      }> = await marketsRes.json();

      // Step 2: For each coin, fetch 7-day volume chart with throttle
      const result: CryptoSignal[] = [];
      for (let i = 0; i < markets.length; i++) {
        const coin = markets[i];
        if (i > 0) await sleep(150);

        let sevenDayAvgVolume = 0;
        try {
          const chartRes = await fetch(
            `https://api.coingecko.com/api/v3/coins/${coin.id}/market_chart?vs_currency=usd&days=7&interval=daily`,
          );
          if (chartRes.ok) {
            const chartData: { total_volumes: Array<[number, number]> } =
              await chartRes.json();
            const volumes = chartData.total_volumes.map(([, v]) => v);
            if (volumes.length > 0) {
              sevenDayAvgVolume =
                volumes.reduce((a, b) => a + b, 0) / volumes.length;
            }
          }
        } catch {
          // If chart fetch fails, avg stays 0 — no Rubicon signal
        }

        // Step 3: Rubicon condition
        const signalType =
          sevenDayAvgVolume > 0 && coin.total_volume > 2 * sevenDayAvgVolume
            ? "rubicon"
            : "neutral";

        result.push({
          coinId: coin.id,
          symbol: coin.symbol,
          name: coin.name,
          currentPrice: coin.current_price,
          dayVolume: coin.total_volume,
          monthAvgVolume: sevenDayAvgVolume,
          priceChangePercentage24h: coin.price_change_percentage_24h ?? 0,
          dayHigh: coin.high_24h ?? 0,
          signalType,
        });
      }

      setSignals(result);
      setLastScanned(new Date());
    } catch {
      toast.error("Scan failed. Please try again.");
    } finally {
      setScanning(false);
    }
  }, []);

  const rubiconCount = signals.filter((s) => s.signalType === "rubicon").length;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(160deg, #0B0F14 0%, #0F141B 100%)",
        color: "#E9EEF6",
        fontFamily: "Satoshi, system-ui, sans-serif",
      }}
    >
      <Toaster theme="dark" />

      {/* ── Header ── */}
      <header
        style={{
          background: "rgba(11,15,20,0.95)",
          borderBottom: "1px solid #2A313C",
          backdropFilter: "blur(8px)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 24px",
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Brand */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "linear-gradient(135deg, #FF3B2F, #FF6A3D)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 16px rgba(255,59,47,0.5)",
              }}
            >
              <Zap size={16} color="white" fill="white" />
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span
                style={{
                  color: "#FF4D3D",
                  fontWeight: 800,
                  fontSize: 18,
                  letterSpacing: "-0.01em",
                  textShadow: "0 0 20px rgba(255,59,47,0.6)",
                }}
              >
                RUBICON
              </span>
              <span
                style={{
                  color: "#E9EEF6",
                  fontWeight: 600,
                  fontSize: 15,
                  letterSpacing: "0.04em",
                }}
              >
                SCANNER
              </span>
            </div>
          </div>

          {/* CTA Button */}
          <button
            type="button"
            data-ocid="scan.primary_button"
            onClick={handleScan}
            disabled={scanning || actorLoading || !actor}
            style={{
              background:
                scanning || actorLoading
                  ? "#3A2020"
                  : "linear-gradient(135deg, #FF3B2F, #FF6A3D)",
              border: "none",
              borderRadius: 9999,
              padding: "10px 22px",
              color: "white",
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: "0.04em",
              cursor: scanning || actorLoading ? "not-allowed" : "pointer",
              boxShadow:
                scanning || actorLoading
                  ? "none"
                  : "0 0 20px rgba(255,59,47,0.5), 0 0 40px rgba(255,59,47,0.2)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "all 0.2s",
              opacity: scanning || actorLoading ? 0.7 : 1,
            }}
          >
            {scanning || actorLoading ? (
              <Loader2
                size={14}
                style={{ animation: "spin 1s linear infinite" }}
              />
            ) : (
              <Activity size={14} />
            )}
            {scanning
              ? "Scanning..."
              : actorLoading
                ? "Connecting..."
                : "Scan Markets"}
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px" }}>
        {/* Page title */}
        <div style={{ marginBottom: 28 }}>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: "#E9EEF6",
              marginBottom: 4,
            }}
          >
            Live Market Signals Dashboard
          </h1>
          {lastScanned && (
            <p style={{ color: "#9AA4B2", fontSize: 13 }}>
              Last scanned:{" "}
              <span style={{ color: "#E9EEF6" }}>{timeAgo(lastScanned)}</span>
            </p>
          )}
        </div>

        {/* Scanning banner */}
        <AnimatePresence>
          {scanning && (
            <motion.div
              key="scanning-banner"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              data-ocid="scan.loading_state"
              style={{
                background: "#141A22",
                border: "1px solid #FF3B2F",
                borderRadius: 12,
                padding: "16px 20px",
                marginBottom: 24,
                display: "flex",
                alignItems: "center",
                gap: 12,
                boxShadow: "0 0 20px rgba(255,59,47,0.2)",
              }}
            >
              <Loader2
                size={18}
                color="#FF4D3D"
                style={{
                  animation: "spin 1s linear infinite",
                  flexShrink: 0,
                }}
              />
              <div>
                <div
                  style={{ color: "#FF4D3D", fontWeight: 700, fontSize: 13 }}
                >
                  Scanning markets...
                </div>
                <div style={{ color: "#9AA4B2", fontSize: 12, marginTop: 2 }}>
                  Fetching top 20 coins from CoinGecko. This may take 15–20
                  seconds.
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* KPI cards */}
        {(signals.length > 0 || scanning) && (
          <div
            style={{
              display: "flex",
              gap: 16,
              marginBottom: 28,
              flexWrap: "wrap",
            }}
          >
            <KpiCard
              label="Total Scanned"
              value={signals.length}
              icon={BarChart3}
            />
            <KpiCard
              label="Rubicon Breakouts"
              value={rubiconCount}
              icon={TrendingUp}
              accent="#2EEA7A"
            />
          </div>
        )}

        {/* Table card */}
        <div
          style={{
            background: "#141A22",
            border: "1px solid #2A313C",
            borderRadius: 16,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "18px 24px",
              borderBottom: "1px solid #2A313C",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#E9EEF6" }}>
                Top 20 Cryptocurrency Market Screener
              </h2>
              <p style={{ color: "#9AA4B2", fontSize: 12, marginTop: 2 }}>
                Rubicon Effect analysis — 7-day average volume baseline
              </p>
            </div>
            {signals.length > 0 && (
              <span
                style={{
                  background: "#1B222C",
                  border: "1px solid #2A313C",
                  borderRadius: 9999,
                  padding: "4px 12px",
                  fontSize: 12,
                  color: "#9AA4B2",
                }}
              >
                {signals.length} coins
              </span>
            )}
          </div>

          {/* Empty state */}
          {!scanning && signals.length === 0 && initialized && (
            <div
              data-ocid="scanner.empty_state"
              style={{ padding: "60px 24px", textAlign: "center" }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: "#1B222C",
                  border: "1px solid #2A313C",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px",
                }}
              >
                <BarChart3 size={28} color="#9AA4B2" />
              </div>
              <p
                style={{
                  color: "#E9EEF6",
                  fontWeight: 600,
                  fontSize: 16,
                  marginBottom: 6,
                }}
              >
                No scan data yet
              </p>
              <p style={{ color: "#9AA4B2", fontSize: 13 }}>
                Click <strong style={{ color: "#FF4D3D" }}>Scan Markets</strong>{" "}
                to analyze the top 20 coins by volume.
              </p>
            </div>
          )}

          {/* Loading initial state */}
          {!initialized && actorLoading && (
            <div
              data-ocid="scanner.loading_state"
              style={{ padding: "60px 24px", textAlign: "center" }}
            >
              <Loader2
                size={32}
                color="#9AA4B2"
                style={{
                  animation: "spin 1s linear infinite",
                  margin: "0 auto",
                }}
              />
              <p style={{ color: "#9AA4B2", fontSize: 13, marginTop: 12 }}>
                Connecting to network...
              </p>
            </div>
          )}

          {/* Table */}
          {signals.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#1B222C" }}>
                    <th style={tableHead}>Ticker</th>
                    <th style={{ ...tableHead, textAlign: "right" }}>
                      Current Price
                    </th>
                    <th style={{ ...tableHead, textAlign: "right" }}>
                      24h Volume
                    </th>
                    <th style={{ ...tableHead, textAlign: "right" }}>
                      7d Avg Volume
                    </th>
                    <th style={{ ...tableHead, textAlign: "right" }}>
                      24h Change
                    </th>
                    <th style={{ ...tableHead, textAlign: "center" }}>
                      Signal Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {signals.map((s, i) => (
                      <motion.tr
                        key={s.coinId}
                        data-ocid={`scanner.item.${i + 1}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.03 }}
                        style={{ borderBottom: "1px solid #2A313C" }}
                        onMouseEnter={(e) => {
                          (
                            e.currentTarget as HTMLTableRowElement
                          ).style.background = "#171E27";
                        }}
                        onMouseLeave={(e) => {
                          (
                            e.currentTarget as HTMLTableRowElement
                          ).style.background = "transparent";
                        }}
                      >
                        <td style={{ ...tableCell, paddingLeft: 24 }}>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                            }}
                          >
                            <span
                              style={{
                                fontWeight: 700,
                                color: "#E9EEF6",
                                fontSize: 14,
                                textTransform: "uppercase",
                              }}
                            >
                              {s.symbol}
                            </span>
                            <span
                              style={{
                                color: "#9AA4B2",
                                fontSize: 12,
                                marginTop: 2,
                              }}
                            >
                              {s.name}
                            </span>
                          </div>
                        </td>
                        <td
                          style={{
                            ...tableCell,
                            textAlign: "right",
                            fontWeight: 600,
                            color: "#E9EEF6",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {formatPrice(s.currentPrice)}
                        </td>
                        <td
                          style={{
                            ...tableCell,
                            textAlign: "right",
                            color: "#E9EEF6",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {formatVolume(s.dayVolume)}
                        </td>
                        <td
                          style={{
                            ...tableCell,
                            textAlign: "right",
                            color: "#9AA4B2",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {formatVolume(s.monthAvgVolume)}
                        </td>
                        <td
                          style={{
                            ...tableCell,
                            textAlign: "right",
                            fontWeight: 600,
                            color:
                              s.priceChangePercentage24h >= 0
                                ? "#2EEA7A"
                                : "#FF6A5E",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {s.priceChangePercentage24h >= 0 ? "+" : ""}
                          {s.priceChangePercentage24h.toFixed(2)}%
                        </td>
                        <td
                          style={{
                            ...tableCell,
                            textAlign: "center",
                            paddingRight: 24,
                          }}
                        >
                          {s.signalType === "rubicon" ? (
                            <span
                              style={{
                                color: "#2EEA7A",
                                fontWeight: 700,
                                fontSize: 13,
                                letterSpacing: "0.06em",
                              }}
                            >
                              RUBICON
                            </span>
                          ) : (
                            <span
                              style={{
                                color: "#9AA4B2",
                                fontWeight: 500,
                                fontSize: 13,
                              }}
                            >
                              --
                            </span>
                          )}
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          textAlign: "center",
          padding: "32px 24px",
          color: "#9AA4B2",
          fontSize: 13,
          borderTop: "1px solid #2A313C",
          marginTop: 48,
        }}
      >
        © {new Date().getFullYear()}. Built with ❤️ using{" "}
        <a
          href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#FF4D3D", textDecoration: "none" }}
        >
          caffeine.ai
        </a>
      </footer>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

const tableHead: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#9AA4B2",
  textAlign: "left",
  whiteSpace: "nowrap",
};

const tableCell: React.CSSProperties = {
  padding: "16px",
  fontSize: 13,
  height: 56,
};
