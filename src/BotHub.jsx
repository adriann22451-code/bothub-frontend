import React, { useState, useEffect, useRef } from "react";
import {
  Bell, Search, ChevronLeft, Home, LayoutGrid, Bot, PieChart, User,
  Star, ChevronRight, Wallet, KeyRound, ShieldCheck, ArrowUpRight, X,
  TrendingUp, TrendingDown, LineChart
} from "lucide-react";

/* ---------------------------------------------------
   Tokens
   bg      #08080D  (void)
   surface #C68B59  (panel)
   line    #96623D
   violet  #7B5CFF  (signal)
   violet2 #5B3FE0
   mint    #2DE0A6  (profit)
   coral   #FF5C7A  (loss)
   text    #F1F0F7
   muted   #8A8AA3
--------------------------------------------------- */

/* URL backend BotHub (server.js). Ganti ke URL deploy (mis. Railway) kalau sudah live. */
const BACKEND_URL = "http://localhost:3001";

/* Basic indicator math — no ML, just standard technical formulas */
function calcEMA(prices, period) {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) ema = prices[i] * k + ema * (1 - k);
  return ema;
}

function calcRSI(prices, period = 14) {
  if (prices.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function getSignal(prices) {
  const ema9 = calcEMA(prices, 9);
  const ema21 = calcEMA(prices, Math.min(21, prices.length));
  const rsi = calcRSI(prices, 14);
  if (ema9 == null || ema21 == null || rsi == null) return { signal: "WARMING UP", ema9, ema21, rsi };
  let signal = "HOLD";
  if (ema9 > ema21 && rsi < 70) signal = "BUY";
  else if (ema9 < ema21 && rsi > 30) signal = "SELL";
  return { signal, ema9, ema21, rsi };
}

/* Live BTC/USDT price via Binance public WebSocket — read-only, no API key needed */
function useLivePrice(symbol = "btcusdt") {
  const [state, setState] = useState({ price: null, spark: null, changePct: 0, connected: false, signal: "WARMING UP", ema9: null, ema21: null, rsi: null });
  const historyRef = useRef([]);

  useEffect(() => {
    let ws;
    try {
      ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol}@trade`);
      ws.onopen = () => setState((s) => ({ ...s, connected: true }));
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const price = parseFloat(data.p);
        const hist = historyRef.current;
        hist.push(price);
        if (hist.length > 30) hist.shift();
        const first = hist[0];
        const changePct = first ? ((price - first) / first) * 100 : 0;
        const { signal, ema9, ema21, rsi } = getSignal(hist);
        setState({ price, spark: [...hist], changePct, connected: true, signal, ema9, ema21, rsi });
      };
      ws.onerror = () => setState((s) => ({ ...s, connected: false }));
      ws.onclose = () => setState((s) => ({ ...s, connected: false }));
    } catch {
      setState((s) => ({ ...s, connected: false }));
    }
    return () => ws && ws.close();
  }, [symbol]);

  return state;
}

/* Live prices for a watchlist of coins — Binance public REST API, no key needed.
   Sebelumnya pakai CoinGecko langsung dari browser: gampang kena rate-limit (429)
   atau CORS block, dan errornya SILENT — data lama tetap tampil jadi kelihatan
   "macet" tanpa ada log apa pun. Binance public endpoint jauh lebih longgar
   limit-nya dan sudah dipakai di bagian lain project ini (live BTC price). */
const WATCHLIST = [
  { symbol: "BTCUSDT", label: "BTC", name: "Bitcoin" },
  { symbol: "ETHUSDT", label: "ETH", name: "Ethereum" },
  { symbol: "BNBUSDT", label: "BNB", name: "BNB" },
  { symbol: "SOLUSDT", label: "SOL", name: "Solana" },
  { symbol: "XRPUSDT", label: "XRP", name: "XRP" },
  { symbol: "DOGEUSDT", label: "DOGE", name: "Dogecoin" },
  { symbol: "ADAUSDT", label: "ADA", name: "Cardano" },
  { symbol: "LINKUSDT", label: "LINK", name: "Chainlink" },
];

function useMultiTicker(refreshMs = 20000) {
  const [tickers, setTickers] = useState({});
  const [connected, setConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [lastError, setLastError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const symbolsParam = encodeURIComponent(JSON.stringify(WATCHLIST.map((c) => c.symbol)));

    async function fetchPrices() {
      try {
        const res = await fetch(
          `https://api.binance.com/api/v3/ticker/24hr?symbols=${symbolsParam}`
        );
        if (!res.ok) throw new Error(`Binance API status ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        const next = {};
        WATCHLIST.forEach((c) => {
          const d = data.find((x) => x.symbol === c.symbol);
          if (d) {
            next[c.symbol] = {
              id: c.symbol,
              symbol: c.label,
              name: c.name,
              price: parseFloat(d.lastPrice),
              changePct: parseFloat(d.priceChangePercent),
            };
          }
        });
        setTickers(next);
        setConnected(true);
        setLastUpdated(Date.now());
        setLastError(null);
      } catch (err) {
        // Dulu di sini errornya ditelan tanpa log — sekarang dicatat ke console
        // supaya kalau macet lagi, penyebabnya (rate limit/CORS/network) kelihatan.
        console.error("[Prices] Gagal ambil harga dari Binance:", err.message);
        if (!cancelled) {
          setConnected(false);
          setLastError(err.message);
        }
      }
    }

    fetchPrices();
    const interval = setInterval(fetchPrices, refreshMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [refreshMs]);

  return { tickers, connected, lastUpdated, lastError };
}

/* Status & riwayat DEX Sniper Pro dari backend (Solana devnet) — polling sederhana */
function useDexSniper(active) {
  const [status, setStatus] = useState({ connected: false, walletReady: false, walletAddress: null, balanceSol: null, snipeEnabled: false, poolsDetected: 0, lastPool: null });
  const [trades, setTrades] = useState([]);
  const [pools, setPools] = useState([]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    async function poll() {
      try {
        const [statusRes, tradesRes, poolsRes] = await Promise.all([
          fetch(`${BACKEND_URL}/dex/status`),
          fetch(`${BACKEND_URL}/dex/trades`),
          fetch(`${BACKEND_URL}/dex/pools`),
        ]);
        const statusData = await statusRes.json();
        const tradesData = await tradesRes.json();
        const poolsData = await poolsRes.json();
        if (cancelled) return;
        setStatus({ ...statusData, connected: true });
        setTrades(tradesData);
        setPools(poolsData);
      } catch {
        if (!cancelled) setStatus((s) => ({ ...s, connected: false }));
      }
    }

    poll();
    const interval = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [active]);

  async function setSnipeEnabled(on) {
    try {
      const res = await fetch(`${BACKEND_URL}/dex/snipe/${on ? "on" : "off"}`, { method: "POST" });
      const data = await res.json();
      setStatus((s) => ({ ...s, snipeEnabled: data.snipeEnabled }));
    } catch {
      // backend nggak nyala / nggak bisa diakses — biarkan status apa adanya
    }
  }

  return { status, trades, pools, setSnipeEnabled };
}

const bots = [
  {
    id: "trend-pro",
    name: "AI Trend Pro",
    tag: "SPOT",
    tagColor: "#7B5CFF",
    live: true,
    blurb: "Follows momentum with AI-timed entries and automatic exits.",
    rating: 4.8,
    reviews: "1.2K",
    profit: 28.45,
    users: "12.5K",
    price: 29,
    exchanges: ["Binance", "Bybit", "OKX"],
    spark: [4, 6, 5, 8, 7, 10, 9, 13, 12, 16, 15, 19],
    detail: {
      timeframe: "15m",
      strategy: "AI Trend Following",
      signal: "AI + EMA + RSI",
      tradeType: "Long / Short",
      risk: "Medium",
      market: "Spot",
      drawdown: 8.23,
      winRate: 72.61,
    },
  },
  {
    id: "dex-sniper",
    name: "DEX Sniper Pro",
    tag: "DEX",
    tagColor: "#2DE0A6",
    live: true,
    blurb: "Catches new token listings the moment liquidity lands.",
    rating: 4.9,
    reviews: "856",
    profit: 35.21,
    users: "8.7K",
    price: 39,
    exchanges: ["Solana"],
    spark: [3, 5, 4, 9, 8, 14, 11, 18, 16, 22, 20, 27],
    detail: {
      timeframe: "1m",
      strategy: "Liquidity Sniping",
      signal: "Mempool + Volume Spike",
      tradeType: "Long only",
      risk: "High",
      market: "DEX",
      drawdown: 14.1,
      winRate: 61.4,
    },
  },
  {
    id: "grid-master",
    name: "Grid Master",
    tag: "FUTURES",
    tagColor: "#FFB454",
    blurb: "Lays a stable grid across ranges for steady, repeatable gains.",
    rating: 4.7,
    reviews: "632",
    profit: 22.17,
    users: "6.1K",
    price: 24,
    exchanges: ["Bybit"],
    spark: [10, 9, 11, 9, 12, 11, 14, 12, 15, 14, 17, 16],
    detail: {
      timeframe: "5m",
      strategy: "Grid Trading",
      signal: "Range + Volatility",
      tradeType: "Long / Short",
      risk: "Low",
      market: "Futures",
      drawdown: 5.9,
      winRate: 68.0,
    },
  },
  {
    id: "arb-bot",
    name: "Arbitrage Bot",
    tag: "ARBITRAGE",
    tagColor: "#FF8A5C",
    blurb: "Plays spot-futures spreads across exchanges automatically.",
    rating: 4.6,
    reviews: "413",
    profit: 18.32,
    users: "2.9K",
    price: 49,
    exchanges: ["Binance", "OKX"],
    spark: [6, 6, 7, 6, 8, 7, 9, 8, 10, 9, 11, 10],
    detail: {
      timeframe: "1m",
      strategy: "Spot-Futures Arbitrage",
      signal: "Spread Threshold",
      tradeType: "Market Neutral",
      risk: "Low",
      market: "Multi-exchange",
      drawdown: 2.4,
      winRate: 81.2,
    },
  },
  {
    id: "portfolio-ai",
    name: "AI Portfolio Manager",
    tag: "AI",
    tagColor: "#7B5CFF",
    blurb: "Rebalances your bag automatically to hold its target weights.",
    rating: 4.8,
    reviews: "711",
    profit: 26.73,
    users: "5.3K",
    price: 34,
    exchanges: ["Binance"],
    spark: [8, 9, 8, 11, 10, 13, 12, 15, 14, 17, 16, 19],
    detail: {
      timeframe: "1d",
      strategy: "Portfolio Rebalancing",
      signal: "Target Weight Drift",
      tradeType: "Rebalance",
      risk: "Low",
      market: "Spot",
      drawdown: 4.7,
      winRate: 74.0,
    },
  },
];

const initialRunningBots = [
  {
    id: "trend-pro",
    name: "AI Trend Pro",
    live: true,
    venue: "Binance Testnet · BTC/USDT",
    runtime: "2d 14h 32m",
    profit: 85.62,
    profitPct: 12.45,
    invested: 500,
    spark: [4, 6, 5, 8, 7, 10, 9, 13, 12, 16, 15, 19],
    positions: [
      {
        pair: "BTC/USDT",
        side: "Long",
        lev: "10x",
        size: "0.012 BTC",
        entry: "66,250.00",
        mark: "67,180.50",
        pnl: "+11.16 (+12.45%)",
        up: true,
      },
    ],
  },
];

/* ---------------------------------------------------
   Small building blocks
--------------------------------------------------- */

function Sparkline({ data, color = "#2DE0A6", w = 90, h = 32 }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");
  const areaId = `area-${color.replace("#", "")}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <defs>
        <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={`0,${h} ${pts} ${w},${h}`}
        fill={`url(#${areaId})`}
        stroke="none"
      />
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Pill({ children, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors"
      style={{
        background: active ? "#7B5CFF" : "#14141F",
        color: active ? "#fff" : "#9C9CB5",
        border: active ? "1px solid #7B5CFF" : "1px solid #2A2A3A",
        boxShadow: active ? "0 0 14px -2px #7B5CFFaa" : "none",
      }}
    >
      {children}
    </button>
  );
}

function TopBar({ title, onBack, right }) {
  return (
    <div className="flex items-center justify-between px-5 pt-4 pb-3">
      {onBack ? (
        <button onClick={onBack} className="w-8 h-8 -ml-2 flex items-center justify-center text-[#F1F0F7]">
          <ChevronLeft size={22} />
        </button>
      ) : (
        <div className="w-8" />
      )}
      <h1 className="text-[17px] font-semibold text-[#F1F0F7]">{title}</h1>
      <div className="w-8 flex items-center justify-end text-[#F1F0F7]">{right}</div>
    </div>
  );
}

function BotRow({ bot, onClick }) {
  const up = bot.profit >= 0;
  const glow = bot.tagColor || "#7B5CFF";
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3.5 rounded-2xl text-left relative overflow-hidden transition-transform active:scale-[0.98]"
      style={{
        background: "#C68B59",
        border: `1px solid ${glow}88`,
        boxShadow: `0 0 16px -4px ${glow}99`,
      }}
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-lg relative z-10"
        style={{
          background: "rgba(255,255,255,0.4)",
          border: `1px solid ${glow}aa`,
          boxShadow: `0 0 10px -2px ${glow}aa`,
          color: "#3B2A1E",
        }}
      >
        <Bot size={20} />
      </div>
      <div className="flex-1 min-w-0 relative z-10">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[14px] font-semibold text-[#3B2A1E] truncate">{bot.name}</span>
          <span
            className="text-[9px] font-bold px-1.5 py-[2px] rounded tracking-wide"
            style={{ background: "rgba(255,255,255,0.45)", color: glow, border: `1px solid ${glow}77` }}
          >
            {bot.tag}
          </span>
          {!bot.live && (
            <span
              className="text-[8px] font-bold px-1.5 py-[2px] rounded tracking-wide"
              style={{ background: "rgba(255,255,255,0.35)", color: "#6B5238", border: "1px dashed #6B5238" }}
            >
              SIMULATED
            </span>
          )}
        </div>
        <p className="text-[12px] text-[#5A4433] mt-0.5 truncate">{bot.blurb}</p>
        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-[#6B5238]">
          <span className="flex items-center gap-1">
            <Star size={11} className="fill-[#FFB454] text-[#FFB454]" /> {bot.rating}
          </span>
          <span>{bot.users} users</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0 relative z-10">
        <Sparkline data={bot.spark} color={up ? "#2DE0A6" : "#FF5C7A"} w={64} h={26} />
        <span className="text-[13px] font-bold" style={{ color: up ? "#1FA97A" : "#D93E5C" }}>
          {up ? "+" : ""}
          {bot.profit}%
        </span>
      </div>
    </button>
  );
}

function BotIconCard({ bot, selected, onToggle }) {
  const glow = bot.tagColor || "#7B5CFF";
  return (
    <button
      onClick={onToggle}
      className="aspect-square w-full flex flex-col items-center justify-center gap-1.5 rounded-2xl relative transition-transform active:scale-[0.96]"
      style={{
        background: selected ? glow : "#C68B59",
        border: `1px solid ${selected ? glow : glow + "88"}`,
        boxShadow: selected ? `0 0 18px -2px ${glow}cc` : `0 0 12px -4px ${glow}88`,
      }}
    >
      {bot.live && (
        <span
          className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full"
          style={{ background: selected ? "#fff" : "#2DE0A6" }}
        />
      )}
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{
          background: selected ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.4)",
          color: selected ? "#fff" : "#3B2A1E",
        }}
      >
        <Bot size={20} />
      </div>
      <span
        className="text-[10px] font-semibold text-center px-1 leading-tight truncate w-full"
        style={{ color: selected ? "#fff" : "#3B2A1E" }}
      >
        {bot.name}
      </span>
    </button>
  );
}

function BotInfoPanel({ bot, onOpen }) {
  const up = bot.profit >= 0;
  const glow = bot.tagColor || "#7B5CFF";
  return (
    <div
      className="rounded-2xl p-4 mb-5 relative overflow-hidden"
      style={{ background: "#C68B59", border: `1px solid ${glow}` }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "rgba(255,255,255,0.4)", color: "#3B2A1E" }}
        >
          <Bot size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-bold text-[#3B2A1E] truncate">{bot.name}</span>
            <span
              className="shrink-0 text-[9px] font-bold px-1.5 py-[2px] rounded tracking-wide"
              style={{ background: "rgba(255,255,255,0.45)", color: glow, border: `1px solid ${glow}77` }}
            >
              {bot.tag}
            </span>
          </div>
          <p className="flex items-center gap-1 text-[11px] text-[#6B5238] mt-0.5">
            <Star size={11} className="fill-[#FFB454] text-[#FFB454]" /> {bot.rating} · {bot.users} pengguna
          </p>
        </div>
        <Sparkline data={bot.spark} color={up ? "#2DE0A6" : "#FF5C7A"} w={56} h={24} />
      </div>

      <p className="text-[12px] text-[#5A4433] leading-relaxed mb-3 line-clamp-2">{bot.blurb}</p>

      <div
        className="grid grid-cols-3 rounded-xl overflow-hidden mb-3"
        style={{ background: "rgba(255,255,255,0.35)" }}
      >
        <div className="flex flex-col items-center justify-center py-2 px-1" style={{ borderRight: "1px solid rgba(59,42,30,0.15)" }}>
          <span className="text-[9px] text-[#6B5238]">Profit</span>
          <span className="text-[13px] font-bold" style={{ color: up ? "#1FA97A" : "#D93E5C" }}>
            {up ? "+" : ""}
            {bot.profit}%
          </span>
        </div>
        <div className="flex flex-col items-center justify-center py-2 px-1" style={{ borderRight: "1px solid rgba(59,42,30,0.15)" }}>
          <span className="text-[9px] text-[#6B5238]">Harga</span>
          <span className="text-[13px] font-bold text-[#3B2A1E]">${bot.price}/mo</span>
        </div>
        <div className="flex flex-col items-center justify-center py-2 px-1">
          <span className="text-[9px] text-[#6B5238]">Reviews</span>
          <span className="text-[13px] font-bold text-[#3B2A1E]">{bot.reviews}</span>
        </div>
      </div>

      <button
        onClick={onOpen}
        className="w-full py-2.5 rounded-xl text-[13px] font-semibold text-white"
        style={{ background: glow }}
      >
        Lihat Detail Bot
      </button>
    </div>
  );
}

function BottomNav({ active, setActive }) {
  const items = [
    { key: "home", label: "Home", icon: Home },
    { key: "prices", label: "Prices", icon: LineChart },
    { key: "mybots", label: "My Bots", icon: Bot },
    { key: "portfolio", label: "Portfolio", icon: PieChart },
    { key: "profile", label: "Profile", icon: User },
  ];
  return (
    <div
      className="grid grid-cols-5 px-1 pt-2 pb-[max(10px,env(safe-area-inset-bottom))] shrink-0"
      style={{ background: "#17C660", borderTop: "1px solid #14A852" }}
    >
      {items.map(({ key, label, icon: Icon }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => setActive(key)}
            className="flex flex-col items-center gap-1 py-1"
          >
            <Icon size={20} color={isActive ? "#7B5CFF" : "#63637C"} strokeWidth={isActive ? 2.4 : 2} />
            <span
              className="text-[10px]"
              style={{ color: isActive ? "#7B5CFF" : "#63637C", fontWeight: isActive ? 600 : 500 }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------
   Screens
--------------------------------------------------- */

const sampleNotifications = [
  { title: "AI Trend Pro closed +11.16 USDT", time: "2m ago" },
  { title: "Grid Master started a new cycle", time: "1h ago" },
  { title: "Arbitrage Bot found a new spread opportunity", time: "Yesterday" },
];

function PricesScreen() {
  const { tickers, connected, lastError } = useMultiTicker();
  const rows = WATCHLIST.map((c) => tickers[c.symbol]).filter(Boolean);

  return (
    <div className="flex-1 overflow-y-auto px-5 pb-6">
      <div className="flex items-center justify-between pt-4 pb-4">
        <h1 className="text-[19px] font-bold text-[#F1F0F7]">Prices</h1>
        {connected ? (
          <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-[2px] rounded" style={{ background: "#2DE0A622", color: "#2DE0A6" }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#2DE0A6" }} /> LIVE
          </span>
        ) : rows.length > 0 ? (
          <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-[2px] rounded" style={{ background: "#FF5C7A22", color: "#FF5C7A" }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#FF5C7A" }} /> GAGAL UPDATE
          </span>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="text-center text-[13px] text-[#63637C] py-16">
          {lastError ? "Gagal menyambung ke data harga live." : "Menyambungkan ke data harga live..."}
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((t) => {
            const up = t.changePct >= 0;
            return (
              <div
                key={t.id}
                className="flex items-center justify-between p-3.5 rounded-2xl"
                style={{ background: "#C68B59", border: "1px solid #A9714B" }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[11px] font-bold" style={{ background: "rgba(255,255,255,0.4)", color: "#3B2A1E" }}>
                    {t.symbol}
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-[#3B2A1E]">{t.name}</p>
                    <p className="text-[11px] text-[#6B5238]">{t.symbol}/USD</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-bold text-[#3B2A1E]">
                    ${t.price >= 1 ? t.price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : t.price.toFixed(5)}
                  </p>
                  <p className="flex items-center justify-end gap-1 text-[11px] font-semibold" style={{ color: up ? "#1FA97A" : "#D93E5C" }}>
                    {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                    {up ? "+" : ""}
                    {t.changePct.toFixed(2)}%
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[10px] text-[#8A8AA3] text-center mt-4">Data dari CoinGecko · update tiap 20 detik</p>
    </div>
  );
}

function HomeScreen({ openBot }) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const live = useLivePrice("btcusdt");
  const liveBots = bots.map((b) =>
    b.id === "trend-pro" && live.spark && live.spark.length > 1
      ? { ...b, spark: live.spark, profit: Number(live.changePct.toFixed(2)) }
      : b
  );
  return (
    <div className="flex-1 overflow-y-auto px-5 pb-6 relative">
      <div className="flex items-center justify-between pt-4 pb-5">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,#7B5CFF,#5B3FE0)" }}
          >
            <Bot size={20} color="#fff" />
          </div>
          <div>
            <p className="text-[15px] font-bold text-[#F1F0F7] leading-none">BotHub</p>
            <p className="text-[11px] text-[#6E6E88] mt-1">Automate. Trade. Profit.</p>
          </div>
        </div>
        <button onClick={() => setNotifOpen((o) => !o)} className="relative w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#C68B59" }}>
          <Bell size={17} color="#3B2A1E" />
          <span className="absolute top-2 right-2.5 w-1.5 h-1.5 rounded-full" style={{ background: "#FF5C7A" }} />
        </button>
      </div>

      {notifOpen && (
        <div className="absolute right-5 top-16 z-20 w-64 rounded-2xl overflow-hidden" style={{ background: "#FAF6EC", border: "1px solid #E4DDCB", boxShadow: "0 12px 30px rgba(0,0,0,0.35)" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid #E4DDCB" }}>
            <p className="text-[13px] font-semibold text-[#241F33]">Notifications</p>
          </div>
          {sampleNotifications.map((n, i) => (
            <div key={i} className="px-4 py-3" style={{ borderBottom: i < sampleNotifications.length - 1 ? "1px solid #E4DDCB" : "none" }}>
              <p className="text-[12px] text-[#241F33] leading-snug">{n.title}</p>
              <p className="text-[10px] text-[#8A8370] mt-1">{n.time}</p>
            </div>
          ))}
        </div>
      )}

      <div className="w-full rounded-3xl p-5 relative overflow-hidden mb-6" style={{ background: "linear-gradient(135deg,#6C4FFF 0%,#4B2FD9 100%)" }}>
        <div className="absolute -right-6 -bottom-8 w-40 h-40 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }} />
        <div className="absolute right-3 top-3 w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.12)" }}>
          <Bot size={30} color="#fff" />
        </div>
        <p className="text-[19px] font-bold text-white leading-snug max-w-[70%]">
          Trade Smarter With Your Own Bots
        </p>
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold text-[#F1F0F7]">Trending Bots</h2>
          {live.connected && (
            <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-[2px] rounded" style={{ background: "#2DE0A622", color: "#2DE0A6" }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#2DE0A6" }} /> LIVE
            </span>
          )}
        </div>
      </div>

      {live.connected && (
        <div className="rounded-2xl p-3.5 mb-4" style={{ background: "#14141F", border: "1px solid #2A2A3A" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-[#8A8AA3]">AI Trend Pro · BTC/USDT signal</span>
            <span
              className="text-[10px] font-bold px-2 py-[3px] rounded-full"
              style={{
                background: live.signal === "BUY" ? "#2DE0A622" : live.signal === "SELL" ? "#FF5C7A22" : "#8A8AA322",
                color: live.signal === "BUY" ? "#2DE0A6" : live.signal === "SELL" ? "#FF5C7A" : "#8A8AA3",
              }}
            >
              {live.signal}
            </span>
          </div>
          <div className="flex gap-4 text-[11px] text-[#8A8AA3]">
            <span>EMA9 {live.ema9 ? live.ema9.toFixed(1) : "—"}</span>
            <span>EMA21 {live.ema21 ? live.ema21.toFixed(1) : "—"}</span>
            <span>RSI {live.rsi ? live.rsi.toFixed(0) : "—"}</span>
          </div>
        </div>
      )}
      <div className="grid grid-cols-4 gap-2.5 mb-4">
        {liveBots.map((b) => (
          <BotIconCard
            key={b.id}
            bot={b}
            selected={selectedId === b.id}
            onToggle={() => setSelectedId((cur) => (cur === b.id ? null : b.id))}
          />
        ))}
      </div>

      {selectedId && (
        <BotInfoPanel
          bot={liveBots.find((b) => b.id === selectedId)}
          onOpen={() => openBot(liveBots.find((b) => b.id === selectedId))}
        />
      )}
    </div>
  );
}

function BotDetailScreen({ bot, onBack, onSubscribe, isRunning }) {
  const [subscribed, setSubscribed] = useState(false);
  const isDex = bot.id === "dex-sniper";
  const dex = useDexSniper(isDex);
  const d = bot.detail;
  const rows = [
    ["Timeframe", d.timeframe],
    ["Strategy", d.strategy],
    ["Signal", d.signal],
    ["Trade Type", d.tradeType],
    ["Risk Level", d.risk],
    ["Works On", d.market],
  ];
  return (
    <div className="flex-1 overflow-y-auto pb-6">
      <TopBar
        title="Bot Detail"
        onBack={onBack}
        right={
          <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full" style={{ background: "#96623D" }}>
            <X size={16} color="#D5D5E4" />
          </button>
        }
      />
      <div className="px-5">
        {!bot.live && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-4" style={{ background: "#FFB45422", border: "1px dashed #FFB454" }}>
            <span className="text-[11px] font-semibold" style={{ color: "#FFB454" }}>
              ⚠ Data simulasi — belum tersambung ke harga/order real
            </span>
          </div>
        )}
        {isDex && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl mb-4"
            style={{
              background: dex.status.connected ? "#2DE0A622" : "#FFB45422",
              border: `1px dashed ${dex.status.connected ? "#2DE0A6" : "#FFB454"}`,
            }}
          >
            <span className="text-[11px] font-semibold" style={{ color: dex.status.connected ? "#2DE0A6" : "#FFB454" }}>
              {dex.status.connected
                ? `⚡ Live · Solana Devnet · ${dex.status.balanceSol != null ? dex.status.balanceSol.toFixed(3) + " SOL" : "..."}`
                : "⚠ Backend belum terhubung — jalankan server DEX Sniper dulu (lihat README)"}
            </span>
          </div>
        )}
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: `${bot.tagColor}22`, color: bot.tagColor }}
          >
            <Bot size={26} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-[17px] font-bold text-[#F1F0F7] truncate">{bot.name}</h2>
              <span className="text-[9px] font-bold px-1.5 py-[2px] rounded" style={{ background: `${bot.tagColor}22`, color: bot.tagColor }}>
                {bot.tag}
              </span>
            </div>
            <p className="flex items-center gap-1 text-[12px] text-[#8A8AA3] mt-0.5">
              <Star size={12} className="fill-[#FFB454] text-[#FFB454]" /> {bot.rating} ({bot.reviews} Reviews)
            </p>
          </div>
        </div>
        <p className="text-[13px] text-[#9C9CB5] leading-relaxed mb-4">{bot.blurb}</p>

        <div className="flex gap-2 mb-5">
          {bot.exchanges.map((ex) => (
            <span key={ex} className="text-[11px] px-3 py-1.5 rounded-lg text-[#4A4438]" style={{ background: "#F2EDE1", border: "1px solid #D8CFB8" }}>
              {ex}
            </span>
          ))}
        </div>

        <div className="rounded-2xl p-4 mb-5" style={{ background: "#FAF6EC", border: "1px solid #E4DDCB" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] text-[#6B6456]">Profit (30D)</span>
            <span className="text-[15px] font-bold" style={{ color: "#1FAE7F" }}>+{bot.profit}%</span>
          </div>
          <Sparkline data={bot.spark} color="#1FAE7F" w={300} h={70} />
          <div className="flex justify-between mt-3 pt-3" style={{ borderTop: "1px solid #E4DDCB" }}>
            <div>
              <p className="text-[11px] text-[#8A8370]">Max Drawdown</p>
              <p className="text-[13px] font-semibold text-[#241F33] mt-0.5">{d.drawdown}%</p>
            </div>
            <div>
              <p className="text-[11px] text-[#8A8370]">Win Rate</p>
              <p className="text-[13px] font-semibold text-[#241F33] mt-0.5">{d.winRate}%</p>
            </div>
            <div>
              <p className="text-[11px] text-[#8A8370]">Total Users</p>
              <p className="text-[13px] font-semibold text-[#241F33] mt-0.5">{bot.users}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl mb-5 divide-y" style={{ background: "#FAF6EC", border: "1px solid #E4DDCB" }}>
          {rows.map(([label, val]) => (
            <div key={label} className="flex items-center justify-between px-4 py-3" style={{ borderColor: "#E4DDCB" }}>
              <span className="text-[13px] text-[#6B6456]">{label}</span>
              <span className="text-[13px] font-medium text-[#241F33]">{val}</span>
            </div>
          ))}
        </div>

        <button
          onClick={() => {
            if (isRunning) return;
            onSubscribe(bot, { key: "Personal", label: "Personal Use", price: 0 });
            setSubscribed(true);
          }}
          disabled={isRunning || subscribed}
          className="w-full py-3.5 rounded-2xl text-[14px] font-semibold text-white"
          style={{ background: isRunning || subscribed ? "#2DE0A6" : "linear-gradient(135deg,#7B5CFF,#5B3FE0)" }}
        >
          {isRunning || subscribed ? "Running · View in My Bots" : "Activate Bot"}
        </button>
      </div>
    </div>
  );
}

function MyBotsScreen({ openRunning, running, stopped, completed, onStop, onRestart, onComplete }) {
  const [tab, setTab] = useState("Running");
  const tabs = ["Running", "Stopped", "Completed"];
  const list = (tab === "Running" ? running : tab === "Stopped" ? stopped : completed).filter((b) => b.live);
  const statusMeta = {
    Running: { label: "RUNNING", bg: "#2DE0A622", color: "#2DE0A6" },
    Stopped: { label: "STOPPED", bg: "#FF5C7A22", color: "#FF5C7A" },
    Completed: { label: "COMPLETED", bg: "#5CA8FF22", color: "#5CA8FF" },
  };
  const meta = statusMeta[tab];
  return (
    <div className="flex-1 overflow-y-auto px-5 pb-6">
      <h1 className="text-[19px] font-bold text-[#F1F0F7] pt-4 pb-4">My Bots</h1>
      <div className="flex gap-2 mb-4">
        {tabs.map((t) => {
          const active = tab === t;
          const count = t === "Running" ? running.filter((b) => b.live).length : t === "Stopped" ? stopped.filter((b) => b.live).length : completed.filter((b) => b.live).length;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-4 py-2 rounded-xl text-[12px] font-medium"
              style={{
                background: active ? "#7B5CFF" : "#C68B59",
                color: active ? "#fff" : "#9C9CB5",
                border: active ? "1px solid #7B5CFF" : "1px solid #A9714B",
              }}
            >
              {t} {count ? `(${count})` : ""}
            </button>
          );
        })}
      </div>

      {list.length > 0 ? (
        <div className="flex flex-col gap-3">
          {list.map((b) => (
            <div key={b.id} className="rounded-2xl p-4" style={{ background: "#C68B59", border: "1px solid #A9714B" }}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#7B5CFF22", color: "#7B5CFF" }}>
                    <Bot size={18} />
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold text-[#F1F0F7]">{b.name}</p>
                    <p className="text-[11px] text-[#6E6E88] mt-0.5">{b.venue}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: meta.bg, color: meta.color }}>
                    {meta.label}
                  </span>
                  {!b.live && (
                    <span className="text-[8px] font-bold px-1.5 py-[2px] rounded" style={{ background: "rgba(255,255,255,0.35)", color: "#6B5238", border: "1px dashed #6B5238" }}>
                      SIMULATED
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex gap-5">
                  <div>
                    <p className="text-[10px] text-[#63637C]">Runtime</p>
                    <p className="text-[12px] font-medium text-[#D5D5E4] mt-0.5">{b.runtime}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#63637C]">Profit</p>
                    <p className="text-[12px] font-semibold mt-0.5" style={{ color: "#2DE0A6" }}>
                      +{b.profit} USDT ({b.profitPct}%)
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#63637C]">Invested</p>
                    <p className="text-[12px] font-medium text-[#D5D5E4] mt-0.5">{b.invested} USDT</p>
                  </div>
                </div>
                <Sparkline data={b.spark} color="#2DE0A6" w={56} h={26} />
              </div>
              <div className="flex gap-2">
                {tab !== "Completed" && (
                  <button
                    onClick={() => openRunning(b)}
                    className="flex-1 py-2.5 rounded-xl text-[12px] font-medium text-[#D5D5E4]"
                    style={{ background: "#B87847", border: "1px solid #96623D" }}
                  >
                    Details
                  </button>
                )}
                {tab === "Running" && (
                  <button onClick={() => onStop(b.id)} className="flex-1 py-2.5 rounded-xl text-[12px] font-medium" style={{ color: "#FF5C7A", border: "1px solid #452330" }}>
                    Stop
                  </button>
                )}
                {tab === "Stopped" && (
                  <>
                    <button onClick={() => onRestart(b.id)} className="flex-1 py-2.5 rounded-xl text-[12px] font-medium" style={{ color: "#2DE0A6", border: "1px solid #1B5C43" }}>
                      Restart
                    </button>
                    <button onClick={() => onComplete(b.id)} className="flex-1 py-2.5 rounded-xl text-[12px] font-medium" style={{ color: "#5CA8FF", border: "1px solid #1F3F5C" }}>
                      Mark Complete
                    </button>
                  </>
                )}
                {tab === "Completed" && (
                  <div className="flex-1 py-2.5 rounded-xl text-[12px] font-medium text-center" style={{ color: "#5CA8FF", background: "#5CA8FF15" }}>
                    Cycle finished
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-center text-[13px] text-[#63637C] py-16">
          {tab === "Running" && "No bots running yet. Subscribe to one from the Marketplace."}
          {tab === "Stopped" && "No stopped bots right now."}
          {tab === "Completed" && "No completed cycles yet."}
        </p>
      )}
    </div>
  );
}

function RunningBotScreen({ bot, onBack, onStop }) {
  const isDex = bot.id === "dex-sniper";
  const [tab, setTab] = useState(isDex ? "Pools" : "Positions");
  const tabs = isDex ? ["Pools", "Trades", "Overview"] : ["Positions", "Trades", "Overview", "Settings"];
  const [editingTpSl, setEditingTpSl] = useState(null);
  const [tpValue, setTpValue] = useState("20");
  const [slValue, setSlValue] = useState("8");
  const [savedMsg, setSavedMsg] = useState(null);
  const [autoReinvest, setAutoReinvest] = useState(true);
  const [notifyOnClose, setNotifyOnClose] = useState(true);
  const meta = bots.find((b) => b.id === bot.id);
  const dex = useDexSniper(isDex);

  const sampleTrades = [
    { pair: "BTC/USDT", side: "Long", result: "+11.16 USDT", time: "2h ago", up: true },
    { pair: "BTC/USDT", side: "Short", result: "-3.40 USDT", time: "9h ago", up: false },
    { pair: "ETH/USDT", side: "Long", result: "+22.53 USDT", time: "1d ago", up: true },
  ];
  return (
    <div className="flex-1 overflow-y-auto pb-6">
      <TopBar title={bot.name} onBack={onBack} />
      <div className="px-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: "#2DE0A622", color: "#2DE0A6" }}>
            RUNNING
          </span>
          <span className="text-[12px] text-[#8A8AA3]">{bot.venue}</span>
        </div>

        {isDex ? (
          <div className="rounded-2xl p-4 mb-4" style={{ background: "#C68B59", border: "1px solid #A9714B" }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[12px] text-[#8A8AA3]">Status Backend</p>
              <span
                className="text-[10px] font-bold px-2 py-[3px] rounded-full"
                style={{ background: dex.status.connected ? "#2DE0A622" : "#FF5C7A22", color: dex.status.connected ? "#2DE0A6" : "#FF5C7A" }}
              >
                {dex.status.connected ? "TERSAMBUNG" : "TIDAK TERSAMBUNG"}
              </span>
            </div>
            <p className="text-[13px] text-[#3B2A1E] mb-0.5">
              Wallet: <span className="font-mono">{dex.status.walletAddress ? `${dex.status.walletAddress.slice(0, 6)}...${dex.status.walletAddress.slice(-4)}` : "—"}</span>
            </p>
            <p className="text-[13px] font-semibold text-[#3B2A1E] mb-3">
              Saldo: {dex.status.balanceSol != null ? `${dex.status.balanceSol.toFixed(4)} SOL (devnet)` : "—"}
            </p>
            <button
              onClick={() => dex.setSnipeEnabled(!dex.status.snipeEnabled)}
              disabled={!dex.status.connected}
              className="w-full py-3 rounded-xl text-[13px] font-semibold"
              style={{
                background: dex.status.snipeEnabled ? "#3A1420" : "#2DE0A6",
                color: dex.status.snipeEnabled ? "#FF5C7A" : "#0B2E22",
                opacity: dex.status.connected ? 1 : 0.5,
              }}
            >
              {dex.status.snipeEnabled ? "Matikan Snipe Otomatis" : "Nyalakan Snipe Otomatis"}
            </button>
          </div>
        ) : (
          <div className="rounded-2xl p-4 mb-4" style={{ background: "#C68B59", border: "1px solid #A9714B" }}>
            <p className="text-[12px] text-[#8A8AA3] mb-1">Total Profit</p>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[24px] font-bold" style={{ color: "#2DE0A6" }}>
                  +{bot.profit} <span className="text-[14px] font-medium">USDT</span>
                </p>
                <p className="text-[12px] font-medium mt-0.5" style={{ color: "#2DE0A6" }}>
                  (+{bot.profitPct}%)
                </p>
              </div>
              <Sparkline data={bot.spark} color="#2DE0A6" w={130} h={50} />
            </div>
          </div>
        )}

        {!isDex && (
        <div className="flex gap-3 mb-5">
          <div className="flex-1 rounded-2xl p-3.5" style={{ background: "#C68B59", border: "1px solid #A9714B" }}>
            <p className="text-[11px] text-[#63637C]">Invested</p>
            <p className="text-[14px] font-semibold text-[#F1F0F7] mt-1">{bot.invested} USDT</p>
          </div>
          <div className="flex-1 rounded-2xl p-3.5" style={{ background: "#C68B59", border: "1px solid #A9714B" }}>
            <p className="text-[11px] text-[#63637C]">Balance</p>
            <p className="text-[14px] font-semibold text-[#F1F0F7] mt-1">{(bot.invested + bot.profit).toFixed(2)} USDT</p>
          </div>
          <div className="flex-1 rounded-2xl p-3.5" style={{ background: "#C68B59", border: "1px solid #A9714B" }}>
            <p className="text-[11px] text-[#63637C]">Win Rate</p>
            <p className="text-[14px] font-semibold text-[#F1F0F7] mt-1">73.33%</p>
          </div>
        </div>
        )}

        <div className="flex gap-5 mb-4" style={{ borderBottom: "1px solid #A9714B" }}>
          {tabs.map((t) => {
            const active = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="pb-2.5 text-[13px] font-medium relative"
                style={{ color: active ? "#F1F0F7" : "#63637C" }}
              >
                {t}
                {active && <span className="absolute left-0 right-0 -bottom-[1px] h-[2px] rounded" style={{ background: "#7B5CFF" }} />}
              </button>
            );
          })}
        </div>

        {tab === "Pools" && (
          <div className="flex flex-col gap-2.5 mb-5">
            {dex.pools.length === 0 && (
              <p className="text-[12px] text-[#63637C] py-6 text-center">
                Belum ada pool baru terdeteksi. {dex.status.connected ? "Sedang memantau Raydium devnet..." : "Backend belum tersambung."}
              </p>
            )}
            {dex.pools.map((p) => (
              <div key={p.signature} className="rounded-2xl p-3.5" style={{ background: "#C68B59", border: "1px solid #A9714B" }}>
                <p className="text-[12px] font-mono text-[#3B2A1E] truncate">{p.poolId}</p>
                <p className="text-[11px] text-[#6B5238] mt-1">{new Date(p.time).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}

        {tab === "Positions" && (
          <div className="flex flex-col gap-3 mb-5">
            {bot.positions.length === 0 && <p className="text-[12px] text-[#63637C] py-6 text-center">No open positions.</p>}
            {bot.positions.map((p) => (
              <div key={p.pair} className="rounded-2xl p-4" style={{ background: "#C68B59", border: "1px solid #A9714B" }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[14px] font-semibold text-[#F1F0F7]">{p.pair}</span>
                  <span className="text-[11px] text-[#6E6E88]">{p.side} | {p.lev}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div>
                    <p className="text-[10px] text-[#63637C]">Size</p>
                    <p className="text-[12px] text-[#D5D5E4] mt-0.5">{p.size}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#63637C]">Entry Price</p>
                    <p className="text-[12px] text-[#D5D5E4] mt-0.5">{p.entry}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#63637C]">Mark Price</p>
                    <p className="text-[12px] text-[#D5D5E4] mt-0.5">{p.mark}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] text-[#63637C]">PnL (USDT)</span>
                  <span className="text-[13px] font-semibold" style={{ color: p.up ? "#2DE0A6" : "#FF5C7A" }}>
                    {p.pnl}
                  </span>
                </div>
                <button
                  onClick={() => setEditingTpSl(editingTpSl === p.pair ? null : p.pair)}
                  className="w-full py-2.5 rounded-xl text-[12px] font-medium text-[#D5D5E4]"
                  style={{ background: "#B87847", border: "1px solid #96623D" }}
                >
                  Take Profit / Stop Loss
                </button>
                {editingTpSl === p.pair && (
                  <div className="mt-3 pt-3" style={{ borderTop: "1px solid #96623D" }}>
                    <div className="flex gap-2 mb-2">
                      <div className="flex-1">
                        <p className="text-[10px] text-[#63637C] mb-1">Take Profit %</p>
                        <input
                          value={tpValue}
                          onChange={(e) => setTpValue(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg text-[12px] text-[#F1F0F7] outline-none"
                          style={{ background: "#96623D33", border: "1px solid #96623D" }}
                        />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] text-[#63637C] mb-1">Stop Loss %</p>
                        <input
                          value={slValue}
                          onChange={(e) => setSlValue(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg text-[12px] text-[#F1F0F7] outline-none"
                          style={{ background: "#96623D33", border: "1px solid #96623D" }}
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setSavedMsg(p.pair);
                        setEditingTpSl(null);
                        setTimeout(() => setSavedMsg(null), 2000);
                      }}
                      className="w-full py-2 rounded-lg text-[12px] font-semibold text-white"
                      style={{ background: "#2F6FED" }}
                    >
                      Save
                    </button>
                  </div>
                )}
                {savedMsg === p.pair && (
                  <p className="text-[11px] mt-2 text-center" style={{ color: "#2DE0A6" }}>
                    TP {tpValue}% / SL {slValue}% saved for {p.pair}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
        {tab === "Trades" && isDex && (
          <div className="flex flex-col gap-2.5 mb-5">
            {dex.trades.length === 0 && <p className="text-[12px] text-[#63637C] py-6 text-center">Belum ada riwayat snipe.</p>}
            {dex.trades.map((t, i) => (
              <div key={i} className="rounded-2xl p-3.5" style={{ background: "#C68B59", border: "1px solid #A9714B" }}>
                <div className="flex items-center justify-between mb-1">
                  <span
                    className="text-[10px] font-bold px-2 py-[2px] rounded"
                    style={{
                      background: t.status === "SNIPED" ? "#2DE0A622" : t.status === "FAILED" ? "#FF5C7A22" : "#8A8AA322",
                      color: t.status === "SNIPED" ? "#2DE0A6" : t.status === "FAILED" ? "#FF5C7A" : "#6B5238",
                    }}
                  >
                    {t.status}
                  </span>
                  <span className="text-[11px] text-[#6B5238]">{new Date(t.time).toLocaleTimeString()}</span>
                </div>
                <p className="text-[11px] font-mono text-[#3B2A1E] truncate">{t.poolId}</p>
                {t.detail && <p className="text-[11px] text-[#6B5238] mt-1">{t.detail}</p>}
              </div>
            ))}
          </div>
        )}
        {tab === "Trades" && !isDex && (
          <div className="flex flex-col gap-2.5 mb-5">
            {sampleTrades.map((t, i) => (
              <div key={i} className="flex items-center justify-between rounded-2xl p-3.5" style={{ background: "#C68B59", border: "1px solid #A9714B" }}>
                <div>
                  <p className="text-[13px] font-medium text-[#F1F0F7]">{t.pair}</p>
                  <p className="text-[11px] text-[#6E6E88] mt-0.5">{t.side} · {t.time}</p>
                </div>
                <span className="text-[13px] font-semibold" style={{ color: t.up ? "#2DE0A6" : "#FF5C7A" }}>
                  {t.result}
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === "Overview" && meta && (
          <div className="rounded-2xl mb-5 divide-y" style={{ background: "#C68B59", border: "1px solid #A9714B" }}>
            {[
              ["Timeframe", meta.detail.timeframe],
              ["Strategy", meta.detail.strategy],
              ["Signal", meta.detail.signal],
              ["Trade Type", meta.detail.tradeType],
              ["Risk Level", meta.detail.risk],
              ["Works On", meta.detail.market],
            ].map(([label, val]) => (
              <div key={label} className="flex items-center justify-between px-4 py-3" style={{ borderColor: "#A9714B" }}>
                <span className="text-[13px] text-[#5A4433]">{label}</span>
                <span className="text-[13px] font-medium text-[#3B2A1E]">{val}</span>
              </div>
            ))}
          </div>
        )}

        {tab === "Settings" && (
          <div className="flex flex-col gap-2.5 mb-5">
            <button
              onClick={() => setAutoReinvest((v) => !v)}
              className="w-full flex items-center justify-between rounded-2xl p-3.5"
              style={{ background: "#C68B59", border: "1px solid #A9714B" }}
            >
              <div className="text-left">
                <p className="text-[13px] font-medium text-[#F1F0F7]">Auto-reinvest profits</p>
                <p className="text-[11px] text-[#6E6E88] mt-0.5">Compound gains back into this bot</p>
              </div>
              <span className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: autoReinvest ? "#2DE0A622" : "#63637C22", color: autoReinvest ? "#2DE0A6" : "#63637C" }}>
                {autoReinvest ? "ON" : "OFF"}
              </span>
            </button>
            <button
              onClick={() => setNotifyOnClose((v) => !v)}
              className="w-full flex items-center justify-between rounded-2xl p-3.5"
              style={{ background: "#C68B59", border: "1px solid #A9714B" }}
            >
              <div className="text-left">
                <p className="text-[13px] font-medium text-[#F1F0F7]">Notify on trade close</p>
                <p className="text-[11px] text-[#6E6E88] mt-0.5">Get a push notification per closed trade</p>
              </div>
              <span className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: notifyOnClose ? "#2DE0A622" : "#63637C22", color: notifyOnClose ? "#2DE0A6" : "#63637C" }}>
                {notifyOnClose ? "ON" : "OFF"}
              </span>
            </button>
          </div>
        )}

        <button
          onClick={() => {
            onStop(bot.id);
            onBack();
          }}
          className="w-full py-3.5 rounded-2xl text-[14px] font-semibold"
          style={{ background: "#3A1420", color: "#FF5C7A", border: "1px solid #5A1E2C" }}
        >
          Stop Bot
        </button>
      </div>
    </div>
  );
}

function PortfolioScreen({ running, stopped, completed }) {
  const allBots = [...running, ...stopped, ...completed];
  const totalInvested = allBots.reduce((sum, b) => sum + b.invested, 0);
  const totalProfit = allBots.reduce((sum, b) => sum + b.profit, 0);
  const totalBalance = totalInvested + totalProfit;
  return (
    <div className="flex-1 overflow-y-auto px-5 pb-6">
      <h1 className="text-[19px] font-bold text-[#F1F0F7] pt-4 pb-4">Portfolio</h1>
      <div className="rounded-2xl p-5 mb-5" style={{ background: "linear-gradient(135deg,#6C4FFF 0%,#4B2FD9 100%)" }}>
        <p className="text-[12px] text-white/70">Total Balance</p>
        <p className="text-[26px] font-bold text-white mt-1">{totalBalance.toFixed(2)} USDT</p>
        <p className="text-[12px] font-medium mt-1" style={{ color: "#C9FFEB" }}>
          {totalProfit >= 0 ? "+" : ""}
          {totalProfit.toFixed(2)} USDT all-time
        </p>
        <p className="text-[10px] mt-2" style={{ color: "rgba(255,255,255,0.6)" }}>
          ⚠ Angka di atas dihitung dari data app, bukan dari saldo testnet Binance beneran
        </p>
      </div>
      <h2 className="text-[14px] font-semibold text-[#F1F0F7] mb-3">Connections</h2>
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2 p-3.5 rounded-2xl" style={{ background: "#14141F", border: "1px dashed #2A2A3A" }}>
          <KeyRound size={18} color="#8A8AA3" />
          <div className="flex-1">
            <p className="text-[13px] font-medium text-[#F1F0F7]">Binance Testnet (via backend)</p>
            <p className="text-[11px] text-[#8A8AA3]">Dikelola di server Railway, bukan di app ini</p>
          </div>
          <span className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: "#2DE0A622", color: "#2DE0A6" }}>
            ACTIVE
          </span>
        </div>
        <div className="flex items-center gap-2 p-3.5 rounded-2xl" style={{ background: "#C68B59", border: "1px dashed #A9714B" }}>
          <Wallet size={18} color="#6B5238" />
          <div className="flex-1">
            <p className="text-[13px] font-medium text-[#3B2A1E]">Wallet connect</p>
            <p className="text-[11px] text-[#6B5238]">Belum diimplementasi</p>
          </div>
          <span className="text-[9px] font-bold px-2 py-1 rounded-lg" style={{ background: "rgba(255,255,255,0.4)", color: "#6B5238" }}>
            SIMULATED
          </span>
        </div>
        <div className="flex items-center gap-2 p-3.5 rounded-2xl mt-1" style={{ color: "#63637C" }}>
          <ShieldCheck size={14} />
          <span className="text-[11px]">Your API keys & private keys are encrypted and stored securely.</span>
        </div>
      </div>
    </div>
  );
}

function ProfileScreen() {
  const rows = [
    { label: "Account Settings", info: "Manage your name, email, and login details." },
    { label: "My Plan", info: "You're using BotHub for personal, non-subscription use." },
    { label: "Security", info: "Two-factor authentication is currently off." },
    { label: "Notifications", info: "Bot alerts and price alerts are turned on." },
    { label: "Help & Support", info: "Reach us anytime at support@bothub.app." },
  ];
  const [open, setOpen] = useState(null);
  return (
    <div className="flex-1 overflow-y-auto px-5 pb-6">
      <h1 className="text-[19px] font-bold text-[#F1F0F7] pt-4 pb-4">Profile</h1>
      <div className="flex items-center gap-3 p-4 rounded-2xl mb-5" style={{ background: "#C68B59", border: "1px solid #A9714B" }}>
        <div className="w-14 h-14 rounded-full flex items-center justify-center text-[18px] font-bold text-white" style={{ background: "linear-gradient(135deg,#7B5CFF,#5B3FE0)" }}>
          A
        </div>
        <div>
          <p className="text-[15px] font-semibold text-[#F1F0F7]">Trader Account</p>
          <p className="text-[12px] text-[#6E6E88]">Personal use · 3 bots active</p>
        </div>
      </div>
      <div className="rounded-2xl divide-y" style={{ background: "#C68B59", border: "1px solid #A9714B" }}>
        {rows.map((r) => (
          <div key={r.label}>
            <button
              onClick={() => setOpen(open === r.label ? null : r.label)}
              className="w-full flex items-center justify-between px-4 py-3.5"
              style={{ borderColor: "#A9714B" }}
            >
              <span className="text-[13px] text-[#D5D5E4]">{r.label}</span>
              <ChevronRight size={16} color="#63637C" style={{ transform: open === r.label ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
            </button>
            {open === r.label && (
              <div className="px-4 pb-3.5">
                <p className="text-[12px] text-[#3B2A1E]">{r.info}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------
   App shell
--------------------------------------------------- */

export default function BotHubApp() {
  const [tab, setTab] = useState("home");
  const [view, setView] = useState(null); // { type: 'botDetail'|'running', data }
  const [running, setRunning] = useState(initialRunningBots);
  const [stopped, setStopped] = useState([]);
  const [completed, setCompleted] = useState([]);
  const live = useLivePrice("btcusdt"); // dipakai buat sinkronkan mark price/PnL bot yang trade BTC/USDT

  // Setiap ada tick harga baru dari Binance, update mark price & PnL semua posisi
  // BTC/USDT yang lagi jalan (dulu ini cuma di-set sekali waktu bot start, terus diam).
  useEffect(() => {
    if (live.price == null) return;
    setRunning((prev) =>
      prev.map((b) => {
        if (!b.positions || b.positions.length === 0) return b;
        const newPositions = b.positions.map((p) => {
          if (p.pair !== "BTC/USDT") return p;
          const entryNum = parseFloat(String(p.entry).replace(/,/g, ""));
          const sizeNum = parseFloat(String(p.size));
          if (!entryNum || !sizeNum) return p;
          const dir = p.side === "Long" ? 1 : -1;
          const pnlUsd = (live.price - entryNum) * sizeNum * dir;
          const pnlPct = (pnlUsd / (entryNum * sizeNum)) * 100;
          return {
            ...p,
            mark: live.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            pnl: `${pnlUsd >= 0 ? "+" : ""}${pnlUsd.toFixed(2)} (${pnlUsd >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%)`,
            up: pnlUsd >= 0,
          };
        });
        const totalPnl = newPositions.reduce((sum, p) => {
          const n = parseFloat(String(p.pnl).split(" ")[0].replace(/[+,]/g, ""));
          return sum + (isNaN(n) ? 0 : n);
        }, 0);
        return {
          ...b,
          positions: newPositions,
          profit: b.id === "trend-pro" ? Number(totalPnl.toFixed(2)) : b.profit,
          profitPct: b.id === "trend-pro" && b.invested ? Number(((totalPnl / b.invested) * 100).toFixed(2)) : b.profitPct,
        };
      })
    );
  }, [live.price]);

  const openBot = (bot) => setView({ type: "botDetail", data: bot });
  const openRunning = (bot) => setView({ type: "running", data: { id: bot.id } });
  const closeView = () => setView(null);

  const changeTab = (t) => {
    setView(null);
    setTab(t);
  };

  const subscribeBot = (bot, chosenPlan) => {
    if (running.some((r) => r.id === bot.id)) return;
    const newEntry = {
      id: bot.id,
      name: bot.name,
      live: bot.live,
      venue: `${bot.exchanges[0]} · Auto`,
      runtime: "Just started",
      profit: 0,
      profitPct: 0,
      invested: bot.price * 10,
      plan: chosenPlan.key,
      spark: new Array(12).fill(10),
      positions:
        bot.id === "trend-pro" && live.price != null
          ? [
              {
                pair: "BTC/USDT",
                side: "Long",
                lev: "10x",
                size: "0.012 BTC",
                entry: live.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                mark: live.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                pnl: "+0.00 (+0.00%)",
                up: true,
              },
            ]
          : [],
    };
    setRunning((r) => [newEntry, ...r]);
    setStopped((s) => s.filter((b) => b.id !== bot.id));
    setTab("mybots");
    setView(null);
  };

  const stopBot = (id) => {
    setRunning((r) => {
      const target = r.find((b) => b.id === id);
      if (target) setStopped((s) => [{ ...target }, ...s]);
      return r.filter((b) => b.id !== id);
    });
  };

  const restartBot = (id) => {
    setStopped((s) => {
      const target = s.find((b) => b.id === id);
      if (target) setRunning((r) => [{ ...target, runtime: "Just restarted" }, ...r]);
      return s.filter((b) => b.id !== id);
    });
  };

  const completeBot = (id) => {
    setStopped((s) => {
      const target = s.find((b) => b.id === id);
      if (target) setCompleted((c) => [{ ...target }, ...c]);
      return s.filter((b) => b.id !== id);
    });
  };

  let content;
  if (view?.type === "botDetail") {
    content = (
      <BotDetailScreen
        bot={view.data}
        onBack={closeView}
        onSubscribe={subscribeBot}
        isRunning={running.some((r) => r.id === view.data.id)}
      />
    );
  } else if (view?.type === "running") {
    const liveBot = running.find((r) => r.id === view.data.id) || view.data;
    content = <RunningBotScreen bot={liveBot} onBack={closeView} onStop={stopBot} />;
  } else if (tab === "home") {
    content = <HomeScreen openBot={openBot} />;
  } else if (tab === "prices") {
    content = <PricesScreen />;
  } else if (tab === "mybots") {
    content = (
      <MyBotsScreen
        openRunning={openRunning}
        running={running}
        stopped={stopped}
        completed={completed}
        onStop={stopBot}
        onRestart={restartBot}
        onComplete={completeBot}
      />
    );
  } else if (tab === "portfolio") {
    content = <PortfolioScreen running={running} stopped={stopped} completed={completed} />;
  } else {
    content = <ProfileScreen />;
  }

  return (
    <div className="w-full flex items-center justify-center" style={{ background: "#050508", height: "100dvh" }}>
      <div
        className="w-full max-w-[400px] flex flex-col overflow-hidden relative"
        style={{ background: "#1FDD6B", height: "100dvh", maxHeight: "900px", borderRadius: "40px", border: "1px solid #A9714B", boxShadow: "0 40px 100px rgba(0,0,0,0.6)" }}
      >
        <style>{`
          .no-scrollbar::-webkit-scrollbar { display: none; }
          .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
          * { font-family: -apple-system, "Inter", "Segoe UI", system-ui, sans-serif; }
          html, body { margin: 0; padding: 0; overflow: hidden; }
        `}</style>
        {content}
        {!view && <BottomNav active={tab} setActive={changeTab} />}
      </div>
    </div>
  );
}
