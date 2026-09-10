'use client';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Empty, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import {
  Activity,
  ArrowUpRight,
  RefreshCw,
  Plug,
  Search,
  ArrowDownUp,
  Star,
  Download,
  Info,
  Check,
  Clock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  type Platform,
  type Market,
  type Forecast,
  type Position,
  categories,
  parseForecasts,
  positions,
  qualifies,
  horizonMatches,
  comparePositions,
} from '@/lib/markets';
type Scan = {
  markets: Market[];
  busy: boolean;
  error: string;
  warning: string;
  complete: boolean;
  pages: number;
  scanned: number;
  at: number;
};
const blank: Scan = {
  markets: [],
  busy: false,
  error: '',
  warning: '',
  complete: false,
  pages: 0,
  scanned: 0,
  at: 0,
};
const number = (v: number) =>
  new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(v);
const MAX_MARKETS = 10000;
const pct = (v: number | null) =>
  v === null ? '—' : `${(v * 100).toFixed(1)}%`;
const pp = (v: number | null) =>
  v === null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)} pp`;
const cents = (v: number | null) =>
  v === null ? '—' : `${(v * 100).toFixed(1)}¢`;
function duration(end: string | null, now: number) {
  if (!end) return 'Unknown';
  const d = (Date.parse(end) - now) / 86400000;
  if (!Number.isFinite(d)) return 'Unknown';
  if (d <= 0) return 'Ended';
  if (d < 1 / 24) return `${Math.ceil(d * 1440)}m`;
  if (d < 1) return `${Math.ceil(d * 24)}h`;
  return `${Math.ceil(d)}d`;
}
function Picker({
  value,
  onChange,
  items,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  items: [string, string][];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => v !== null && onChange(v)}>
      <SelectTrigger aria-label={label} className="h-10">
        <SelectValue>{items.find(([v]) => v === value)?.[1]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {items.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export default function Home() {
  const [platform, setPlatform] = useState<Platform>('kalshi');
  const [scans, setScans] = useState<Record<Platform, Scan>>({
    kalshi: { ...blank },
    polymarket: { ...blank },
  });
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [priorityMarkets, setPriorityMarkets] = useState<Market[]>([]);
  const [feedUrl, setFeedUrl] = useState('');
  const [urlDraft, setUrlDraft] = useState('');
  const [feedError, setFeedError] = useState('');
  const [feedStatus, setFeedStatus] = useState('Not connected');
  const [feedBusy, setFeedBusy] = useState(false);
  const [jsonDraft, setJsonDraft] = useState('');
  const [sourceOpen, setSourceOpen] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All categories');
  const [horizon, setHorizon] = useState('all');
  const [sort, setSort] = useState('gap-desc');
  const [view, setView] = useState('qualified');
  const [cost, setCost] = useState(2);
  const [threshold, setThreshold] = useState(1.5);
  const [basis, setBasis] = useState<'net' | 'raw'>('net');
  const [auto, setAuto] = useState(true);
  const [combos, setCombos] = useState(false);
  const [stars, setStars] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const controllers = useRef<Partial<Record<Platform, AbortController>>>({});
  const scanRefs = useRef(scans);
  scanRefs.current = scans;
  const forecastRef = useRef(forecasts);
  forecastRef.current = forecasts;
  const sourceRef = useRef({ url: '', imported: false });
  const actions = useRef<any>({});
  const loadFeed = useCallback(async (url?: string) => {
    setFeedBusy(true);
    setFeedError('');
    try {
      const target = url ?? sourceRef.current.url;
      if (!target && sourceRef.current.imported) return;
      let response: Response;
      if (target) {
        const u = new URL(target);
        if (u.protocol !== 'https:' || u.username || u.password)
          throw new Error(
            'Use a public HTTPS URL without embedded credentials.',
          );
        response = await fetch(u.href, {
          credentials: 'omit',
          signal: AbortSignal.timeout(15000),
          cache: 'no-store',
        });
      } else
        response = await fetch('/api/forecasts', {
          cache: 'no-store',
          signal: AbortSignal.timeout(20000),
        });
      const text = await response.text();
      if (!response.ok)
        throw new Error(
          'Could not load the forecast feed. Check the URL, server configuration, and CORS access.',
        );
      if (text.length > 10000000) throw new Error('Feed is larger than 10 MB.');
      const data = JSON.parse(text);
      const parsed = parseForecasts(data);
      setForecasts(parsed);
      setFeedStatus(
        target
          ? 'Public feed connected'
          : data.configured
            ? 'Private feed connected'
            : 'Not connected',
      );
    } catch (e) {
      setFeedError(
        e instanceof Error ? e.message : 'Forecast connection failed.',
      );
      setForecasts([]);
      setFeedStatus('Connection failed');
    } finally {
      setFeedBusy(false);
    }
  }, []);
  const scan = useCallback(
    async (p: Platform, includeCombos: boolean, force = false) => {
      if (controllers.current[p] && !force) return;
      if (force) controllers.current[p]?.abort();
      const controller = new AbortController();
      controllers.current[p] = controller;
      const collected = new Map<string, Market>();
      let cursor = '';
      let pages = 0,
        scanned = 0;
      const cursors = new Set<string>();
      setScans((s) => ({
        ...s,
        [p]: {
          ...s[p],
          busy: true,
          error: '',
          warning: '',
          complete: false,
          pages: 0,
          scanned: 0,
        },
      }));
      try {
        do {
          const params = new URLSearchParams({
            platform: p,
            combos: String(includeCombos),
          });
          if (cursor) params.set('cursor', cursor);
          const response = await fetch('/api/markets?' + params, {
            signal: controller.signal,
            cache: 'no-store',
          });
          const data: any = await response.json();
          if (!response.ok)
            throw new Error(data.error || 'Market scan failed.');
          for (const m of data.markets) {
            if (collected.size >= MAX_MARKETS) break;
            collected.set(m.id, m);
          }
          pages++;
          scanned += data.scanned;
          cursor = data.next || '';
          if (cursor && cursors.has(cursor))
            throw new Error(
              'Provider repeated a page cursor; scan is incomplete.',
            );
          cursors.add(cursor);
          if (controller.signal.aborted) return;
          const capped = collected.size >= MAX_MARKETS;
          setScans((s) => ({
            ...s,
            [p]: {
              markets: Array.from(collected.values()),
              busy: !capped && !!cursor,
              error: '',
              warning: data.warning || s[p].warning,
              complete: capped || !cursor,
              pages,
              scanned,
              at: Date.now(),
            },
          }));
          if (capped) break;
        } while (cursor);
      } catch (e) {
        if (!controller.signal.aborted)
          setScans((s) => ({
            ...s,
            [p]: {
              ...s[p],
              busy: false,
              complete: false,
              error: e instanceof Error ? e.message : 'Scan interrupted.',
            },
          }));
      } finally {
        if (controllers.current[p] === controller)
          delete controllers.current[p];
      }
    },
    [],
  );
  const refresh = useCallback(
    (force = false) => {
      setLastRefresh(Date.now());
      void scan('kalshi', combos, force);
      void scan('polymarket', false, force);
      void loadFeed();
    },
    [scan, combos, loadFeed],
  );
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem('edgeboard-preferences') || '{}',
      );
      if (Array.isArray(saved.stars)) setStars(saved.stars);
      if (
        typeof saved.cost === 'number' &&
        saved.cost >= 0 &&
        saved.cost <= 100
      )
        setCost(saved.cost);
      const url = localStorage.getItem('edgeboard-feed') || '';
      sourceRef.current.url = url;
      setFeedUrl(url);
      setUrlDraft(url);
      const imported = localStorage.getItem('edgeboard-forecasts');
      if (imported && !url) {
        setForecasts(parseForecasts(JSON.parse(imported)));
        sourceRef.current.imported = true;
        setFeedStatus('Imported forecasts');
      }
    } catch {}
    refresh();
    return () => {
      controllers.current.kalshi?.abort();
      controllers.current.polymarket?.abort();
      controllers.current = {};
    };
  }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => refresh(), 60000);
    return () => clearInterval(t);
  }, [auto, refresh]);
  useEffect(() => {
    try {
      localStorage.setItem(
        'edgeboard-preferences',
        JSON.stringify({ stars, cost }),
      );
    } catch {}
  }, [stars, cost]);
  useEffect(
    () => setPage(0),
    [query, category, horizon, sort, view, platform, threshold, basis],
  );
  const allMarkets = useMemo(() => {
    const map = new Map<string, Market>();
    for (const p of ['kalshi', 'polymarket'] as const) {
      let loaded = 0;
      for (const m of [
        ...priorityMarkets.filter((market) => market.platform === p),
        ...scans[p].markets,
      ]) {
        const key = m.platform + ':' + m.id;
        const old = map.get(key);
        if (!old && loaded >= MAX_MARKETS) continue;
        if (!old) loaded++;
        if (!old || old.fetchedAt < m.fetchedAt) map.set(key, m);
      }
    }
    return [...map.values()];
  }, [scans, priorityMarkets]);
  useEffect(() => {
    if (!forecasts.length) {
      setPriorityMarkets([]);
      return;
    }
    let cancelled = false;
    let running = false;
    const controller = new AbortController();
    async function update() {
      if (running) return;
      running = true;
      try {
        const output: Market[] = [];
        for (const platform of ['kalshi', 'polymarket'] as const) {
          const ids = forecasts
            .filter(
              (f) =>
                f.platform === platform && Date.parse(f.expiresAt) > Date.now(),
            )
            .map((f) => f.marketId)
            .slice(0, MAX_MARKETS);
          for (let i = 0; i < ids.length; i += 100) {
            if (cancelled) return;
            const response = await fetch(
              '/api/markets?' +
                new URLSearchParams({
                  platform,
                  ids: ids.slice(i, i + 100).join(','),
                }),
              { signal: controller.signal, cache: 'no-store' },
            );
            if (!response.ok) continue;
            const data: any = await response.json();
            output.push(...data.markets);
          }
        }
        if (!cancelled) setPriorityMarkets(output);
      } catch {
      } finally {
        running = false;
      }
    }
    void update();
    const timer = auto ? setInterval(update, 60000) : undefined;
    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearInterval(timer);
    };
  }, [forecasts, auto, lastRefresh]);
  const allPositions = useMemo(
    () => positions(allMarkets, forecasts, cost, now),
    [allMarkets, forecasts, cost, Math.floor(now / 1000)],
  );
  const qualifying = allPositions.filter((p) => qualifies(p, threshold, basis));
  const coverage = new Set(
    allPositions
      .filter((p) => p.forecastFresh)
      .map((p) => p.market.platform + ':' + p.market.id),
  ).size;
  const rows = useMemo(
    () =>
      allPositions
        .filter(
          (p) =>
            p.market.platform === platform &&
            (category === 'All categories' || p.market.category === category) &&
            horizonMatches(p.market.end, horizon, now) &&
            `${p.market.title} ${p.market.id}`
              .toLowerCase()
              .includes(query.toLowerCase()) &&
            (view === 'all' ||
              (view === 'watchlist' && stars.includes(p.key)) ||
              (view === 'qualified' && qualifies(p, threshold, basis))),
        )
        .sort((a, b) => comparePositions(a, b, sort)),
    [
      allPositions,
      platform,
      category,
      horizon,
      query,
      view,
      stars,
      threshold,
      basis,
      sort,
      now,
    ],
  );
  const pageIndex = Math.min(
    page,
    Math.max(0, Math.ceil(rows.length / 30) - 1),
  );
  const visible = rows.slice(pageIndex * 30, pageIndex * 30 + 30);
  const detail = allPositions.find((p) => p.key === selected);
  const busy = scans.kalshi.busy || scans.polymarket.busy;
  const current = scans[platform];
  const best = qualifying.length
    ? qualifying.reduce((max, p) => Math.max(max, p[basis]!), -Infinity)
    : null;
  function toggleStar(key: string) {
    setStars((s) =>
      s.includes(key) ? s.filter((x) => x !== key) : [...s, key],
    );
  }
  async function connect() {
    try {
      const u = new URL(urlDraft);
      if (u.protocol !== 'https:' || u.username || u.password)
        throw new Error('Use a public HTTPS URL without embedded credentials.');
      sourceRef.current = { url: u.href, imported: false };
      setFeedUrl(u.href);
      localStorage.setItem('edgeboard-feed', u.href);
      localStorage.removeItem('edgeboard-forecasts');
      await loadFeed(u.href);
    } catch (e) {
      setFeedError(e instanceof Error ? e.message : 'Invalid URL.');
    }
  }
  function importForecasts() {
    try {
      const parsed = parseForecasts(JSON.parse(jsonDraft));
      sourceRef.current = { url: '', imported: true };
      setFeedUrl('');
      setUrlDraft('');
      setForecasts(parsed);
      setFeedError('');
      setFeedStatus('Imported forecasts');
      localStorage.removeItem('edgeboard-feed');
      try {
        localStorage.setItem('edgeboard-forecasts', JSON.stringify(parsed));
      } catch {
        setFeedError('Imported for this session; browser storage is full.');
      }
    } catch (e) {
      setFeedError(e instanceof Error ? e.message : 'Invalid JSON.');
    }
  }
  function disconnect() {
    sourceRef.current = { url: '', imported: false };
    setFeedUrl('');
    setUrlDraft('');
    setForecasts([]);
    localStorage.removeItem('edgeboard-feed');
    localStorage.removeItem('edgeboard-forecasts');
    void loadFeed('');
  }
  function exportCsv() {
    const data = [
      [
        'platform',
        'market_id',
        'title',
        'side',
        'ask_dollars',
        'estimated_probability',
        'raw_gap_pp',
        'estimated_net_gap_pp',
        'ai_rating',
        'forecast_source',
        'quote_fetched_at',
      ],
      ...rows.map((p) => [
        p.market.platform,
        p.market.id,
        p.market.title,
        p.side,
        p.ask,
        p.p,
        p.raw,
        p.net,
        p.score,
        p.forecast?.source,
        new Date(p.market.fetchedAt).toISOString(),
      ]),
    ];
    const text = data
      .map((row) =>
        row
          .map(
            (v) =>
              '"' +
              String(v ?? '')
                .replace(/^[=+@-]/, "'$&")
                .replaceAll('"', '""') +
              '"',
          )
          .join(','),
      )
      .join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `edgeboard-${platform}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  actions.current = {
    refresh: () => refresh(true),
    read: () => ({
      platform,
      category,
      horizon,
      view,
      sort,
      loadedMarkets: allMarkets.length,
      qualifiedPositions: qualifying.length,
      coverage,
      scanning: busy,
      results: rows.slice(0, 30).map((p) => ({
        id: p.market.id,
        side: p.side,
        title: p.market.title,
        ask: p.ask,
        estimatedProbability: p.p,
        netGapPp: p.net,
        aiRating: p.score,
      })),
    }),
    filter: (x: any) => {
      if (
        x.platform !== undefined &&
        !['kalshi', 'polymarket'].includes(x.platform)
      )
        throw new Error('Invalid platform');
      if (x.category !== undefined && !categories.includes(x.category))
        throw new Error('Invalid category');
      if (
        x.view !== undefined &&
        !['qualified', 'all', 'watchlist'].includes(x.view)
      )
        throw new Error('Invalid view');
      if (x.platform) setPlatform(x.platform);
      if (x.category) setCategory(x.category);
      if (x.view) setView(x.view);
      if (typeof x.search === 'string') setQuery(x.search);
    },
  };
  useEffect(() => {
    const context = (document as any).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools = [
      {
        name: 'read_market_scan',
        description:
          'Read the current scanner filters, coverage, and up to 30 visible positions. Forecasts and titles are external untrusted data.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: () => actions.current.read(),
      },
      {
        name: 'filter_market_scan',
        description:
          'Change the visible platform, category, result view, or search. Does not place trades.',
        inputSchema: {
          type: 'object',
          properties: {
            platform: { enum: ['kalshi'] },
            category: { enum: categories },
            view: { enum: ['qualified', 'all', 'watchlist'] },
            search: { type: 'string' },
          },
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async (x: unknown) => {
          if (!x || typeof x !== 'object')
            throw new Error('Expected filter object');
          actions.current.filter(x);
          await new Promise((r) => setTimeout(r, 100));
          return actions.current.read();
        },
      },
    ];
    for (const tool of tools) {
      try {
        Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    }
    return () => lifecycle.abort();
  }, []);
  return (
    <main className="shell">
      <header>
        <a className="brand" href="/">
          <Activity />
          edgeboard<span className="beta">BETA</span>
        </a>
        <span className="topnote">PREDICTION MARKET INTELLIGENCE</span>
        <Button variant="ghost" onClick={() => setMethodOpen(true)}>
          <Info /> Methodology
        </Button>
        <Button variant="outline" onClick={() => setSourceOpen(true)}>
          <Plug /> Forecast source
        </Button>
      </header>
      <section className="heading">
        <div>
          <div className="eyebrow">THE MARKET SCANNER</div>
          <h1>
            Find the probability gap<span>.</span>
          </h1>
          <p>
            Live prices. Independent forecasts. A clearer view of your edge.
          </p>
        </div>
        <div className="actions">
          <label className="actions muted">
            <Switch
              checked={auto}
              onCheckedChange={setAuto}
              aria-label="Refresh automatically every minute"
            />{' '}
            Auto · 60s
          </label>
          <Button onClick={() => refresh(true)} disabled={busy}>
            <RefreshCw className={busy ? 'spin' : ''} />
            {busy ? 'Scanning…' : 'Refresh'}
          </Button>
        </div>
      </section>
      <div className="stats">
        {[
          [
            'Markets loaded',
            number(allMarkets.length),
            busy
              ? 'Scanning additional pages…'
              : 'Kalshi + Polymarket · 10,000 each',
          ],
          [
            'Qualified positions',
            String(qualifying.length),
            `${basis === 'net' ? 'Net' : 'Raw'} edge greater than ${threshold} pp`,
          ],
          [
            'Best estimated edge',
            pp(best),
            basis === 'net'
              ? `After ${cost.toFixed(1)}¢ cost allowance`
              : 'Before costs',
          ],
          [
            'Forecast coverage',
            `${allMarkets.length ? ((coverage / allMarkets.length) * 100).toFixed(1) : '0'}%`,
            `${number(coverage)} markets with unexpired forecasts`,
          ],
        ].map(([a, b, c]) => (
          <div key={a}>
            <span>{a}</span>
            <strong
              className={
                a === 'Best estimated edge' && best !== null
                  ? 'text-primary'
                  : ''
              }
            >
              {b}
            </strong>
            <small>{c}</small>
          </div>
        ))}
      </div>
      {(!forecasts.length || feedError) && (
        <div className="notice">
          <Plug />
          <div>
            <b>
              {feedError
                ? 'Your forecast connection needs attention.'
                : 'Your edge starts with an independent forecast.'}
            </b>
            <p>
              {feedError ||
                'Connect a source to calculate gaps and display AI recommendations. Unscored markets are available in Browse markets.'}
            </p>
          </div>
          <Button variant="ghost" onClick={() => setSourceOpen(true)}>
            Connect <ArrowUpRight />
          </Button>
        </div>
      )}
      <section className="surface" style={{ marginTop: 24 }}>
        <div className="toolbar">
          <Tabs
            value={platform}
            onValueChange={(v) => setPlatform(v as Platform)}
          >
            <TabsList className="h-11">
              <TabsTrigger className="px-5" value="kalshi">
                Kalshi{' '}
                <span className="muted">
                  {number(scans.kalshi.markets.length)}
                </span>
              </TabsTrigger>
              <TabsTrigger className="px-5" value="polymarket">
                Polymarket{' '}
                <span className="muted">
                  {number(scans.polymarket.markets.length)}
                </span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="actions">
            <span className="muted" aria-live="polite">
              <span
                className="status-dot"
                style={{
                  background: current.error
                    ? '#dfab80'
                    : current.busy
                      ? '#d4c185'
                      : undefined,
                }}
              />
              {current.busy
                ? `Scanning · ${current.pages} pages`
                : current.error
                  ? 'Partial / unavailable'
                  : current.complete
                    ? 'Scan complete'
                    : 'Connecting'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={exportCsv}
              disabled={!rows.length}
            >
              <Download /> CSV
            </Button>
          </div>
        </div>
        <div className="filters">
          <div className="search">
            <Search />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search markets or tickers…"
              aria-label="Search markets"
            />
          </div>
          <Picker
            label="Category"
            value={category}
            onChange={setCategory}
            items={categories.map((c) => [c, c])}
          />
          <Picker
            label="Time until market closes"
            value={horizon}
            onChange={setHorizon}
            items={[
              ['all', 'All time horizons'],
              ['day', 'Intraday · ≤24 hours'],
              ['week', 'Short · 1–7 days'],
              ['month', 'Medium · 7–30 days'],
              ['quarter', 'Long · 30–90 days'],
              ['long', 'Extended · >90 days'],
              ['unknown', 'Unknown close time'],
            ]}
          />
          <Picker
            label="Sort positions"
            value={sort}
            onChange={setSort}
            items={[
              ['gap-desc', 'Net gap · highest first'],
              ['gap-asc', 'Net gap · lowest first'],
              ['ai', 'AI recommends · highest first'],
              ['closing', 'Closing soonest'],
              ['volume', '24h volume · highest first'],
            ]}
          />
        </div>
        <div
          className="filters"
          style={{ paddingTop: 0, justifyContent: 'space-between' }}
        >
          <div className="actions">
            <Picker
              label="Results view"
              value={view}
              onChange={setView}
              items={[
                ['qualified', 'Qualified edges'],
                ['all', 'Browse markets'],
                ['watchlist', `Watchlist (${stars.length})`],
              ]}
            />
            <label className="actions muted">
              Minimum gap{' '}
              <input
                className="mini-input"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={threshold}
                onChange={(e) =>
                  setThreshold(
                    Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                  )
                }
              />{' '}
              pp
            </label>
            <Picker
              label="Gap calculation"
              value={basis}
              onChange={(v) => setBasis(v as 'net' | 'raw')}
              items={[
                ['net', 'After costs'],
                ['raw', 'Before costs'],
              ]}
            />
          </div>
          <span className="muted">
            {number(rows.length)} positions ·{' '}
            {view === 'qualified' ? 'fresh quotes only' : 'YES + NO'}
          </span>
        </div>
        {(current.error || current.warning) && (
          <div className="error" style={{ margin: '0 22px 18px' }} role="alert">
            {current.error || current.warning}
          </div>
        )}
        {visible.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <span className="sr-only">Watchlist</span>
                </TableHead>
                <TableHead>Market / outcome</TableHead>
                <TableHead>Buy price</TableHead>
                <TableHead>Forecast</TableHead>
                <TableHead
                  aria-sort={
                    sort === 'gap-desc'
                      ? 'descending'
                      : sort === 'gap-asc'
                        ? 'ascending'
                        : 'none'
                  }
                >
                  <button
                    className="actions"
                    onClick={() =>
                      setSort(sort === 'gap-desc' ? 'gap-asc' : 'gap-desc')
                    }
                  >
                    Net gap <ArrowDownUp />
                  </button>
                </TableHead>
                <TableHead aria-sort={sort === 'ai' ? 'descending' : 'none'}>
                  <button className="actions" onClick={() => setSort('ai')}>
                    AI recommends <ArrowDownUp />
                  </button>
                </TableHead>
                <TableHead>Closes in</TableHead>
                <TableHead>24h volume</TableHead>
                <TableHead>
                  <span className="sr-only">Details</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((p) => (
                <TableRow key={p.key}>
                  <TableCell>
                    <button
                      onClick={() => toggleStar(p.key)}
                      aria-label={`${stars.includes(p.key) ? 'Remove from' : 'Add to'} watchlist: ${p.market.title} ${p.side}`}
                      aria-pressed={stars.includes(p.key)}
                    >
                      <Star
                        style={{
                          color: stars.includes(p.key) ? '#9bdfb7' : '#61786a',
                          fill: stars.includes(p.key) ? '#284c37' : 'none',
                        }}
                      />
                    </button>
                  </TableCell>
                  <TableCell>
                    <button
                      className="row-title text-left"
                      onClick={() => setSelected(p.key)}
                    >
                      {p.market.title}
                    </button>
                    <div className="meta">
                      <span className="pill">{p.side}</span>
                      <span>{p.market.category}</span>
                      {!p.fresh && (
                        <span className="negative">Stale / ended</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="mono">{cents(p.ask)}</TableCell>
                  <TableCell className="mono">
                    {pct(p.p)}
                    <div className="muted" style={{ fontSize: 12 }}>
                      {p.forecastFresh
                        ? p.forecast?.source
                        : p.forecast
                          ? 'Expired'
                          : 'No forecast'}
                    </div>
                  </TableCell>
                  <TableCell className="mono">
                    {p.net !== null ? (
                      <span
                        className={
                          p.net > 0
                            ? `gap ${p.net > 5 ? 'strong' : ''}`
                            : 'negative'
                        }
                      >
                        {pp(p.net)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="mono">
                    {p.score !== null ? (
                      <>
                        <span style={{ color: '#a2ddba', fontWeight: 600 }}>
                          {p.score.toFixed(1)}
                        </span>
                        <span className="muted"> / 10</span>
                      </>
                    ) : (
                      <span className="muted">Unrated</span>
                    )}
                  </TableCell>
                  <TableCell className="mono">
                    {duration(p.market.end, now)}
                  </TableCell>
                  <TableCell className="mono">
                    {p.market.volumeUnit === 'USD' ? '$' : ''}
                    {number(p.market.volume)}
                    <div className="muted" style={{ fontSize: 12 }}>
                      {p.market.volumeUnit === 'USD' ? 'USD' : 'contracts'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`View ${p.market.title} details`}
                      onClick={() => setSelected(p.key)}
                    >
                      <ArrowUpRight />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Empty className="empty">
            <Activity />
            <EmptyTitle className="text-xl">
              {view === 'qualified' && !forecasts.length
                ? 'No independent forecasts connected'
                : current.busy
                  ? 'Scanning for matching markets…'
                  : 'No positions match these filters'}
            </EmptyTitle>
            <EmptyDescription className="max-w-lg">
              {view === 'qualified' && !forecasts.length
                ? 'Live markets can be explored now. A forecast source is required before any position can be identified as a potential edge.'
                : 'Try a different category or horizon, or browse all loaded markets. Missing forecasts and stale quotes never qualify.'}
            </EmptyDescription>
            <div className="actions">
              <Button
                variant="outline"
                onClick={() => {
                  setView('all');
                  setCategory('All categories');
                  setHorizon('all');
                  setQuery('');
                }}
              >
                Browse markets
              </Button>
              {!forecasts.length && (
                <Button onClick={() => setSourceOpen(true)}>
                  <Plug /> Connect forecasts
                </Button>
              )}
            </div>
          </Empty>
        )}
        <div className="footer">
          <span>
            {current.complete
              ? 'All available pages scanned'
              : current.busy
                ? 'Coverage expanding as pages load'
                : 'Coverage incomplete'}{' '}
            · {number(current.scanned)} source records checked
            {platform === 'kalshi' && !combos
              ? ' · Standard markets; combos excluded'
              : ''}
          </span>
          <div className="actions">
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={pageIndex === 0}
              onClick={() => setPage(pageIndex - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft />
            </Button>
            <span>
              {pageIndex + 1} / {Math.max(1, Math.ceil(rows.length / 30))}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={(pageIndex + 1) * 30 >= rows.length}
              onClick={() => setPage(pageIndex + 1)}
              aria-label="Next page"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </section>
      <div className="bottomnote">
        <span>
          <Clock
            style={{ display: 'inline', marginRight: 6, width: 13, height: 13 }}
          />
          {auto
            ? `Next refresh in ${Math.max(0, 60 - Math.floor((now - lastRefresh) / 1000))}s`
            : 'Auto-refresh paused'}{' '}
          ·{' '}
          {current.at
            ? `Last page fetched ${new Date(current.at).toLocaleTimeString()}`
            : 'Awaiting first response'}
        </span>
        <span>
          Estimates, not true probabilities. Ratings are supplied by your
          forecast provider.
        </span>
      </div>
      <Dialog open={sourceOpen} onOpenChange={setSourceOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-6">
          <DialogTitle className="text-xl">
            Connect independent forecasts
          </DialogTitle>
          <DialogDescription>
            Use a compatible forecast feed or import your own estimates. No AI
            ratings or probabilities are fabricated.
          </DialogDescription>
          <div className="connection">
            <span className="pill">{feedStatus}</span>{' '}
            <span className="muted">{forecasts.length} forecasts loaded</span>
          </div>
          <label className="field">
            Public forecast feed URL
            <input
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder="https://your-provider.example/forecasts.json"
              type="url"
            />
          </label>
          <p className="connection">
            Public feeds must allow browser access (CORS). Do not paste API keys
            or private tokens here. The URL is stored on this device and fetched
            once per minute while the page is open.
          </p>
          <div className="actions">
            <Button disabled={feedBusy || !urlDraft} onClick={connect}>
              {feedBusy ? <RefreshCw className="spin" /> : <Plug />} Connect
              feed
            </Button>
            <Button variant="outline" onClick={disconnect}>
              Use server configuration
            </Button>
          </div>
          {feedError && (
            <div className="error" role="alert">
              {feedError}
            </div>
          )}
          <details className="connection">
            <summary>Private feeds and data format</summary>
            <p>
              For authenticated feeds, configure <code>FORECAST_FEED_URL</code>{' '}
              and <code>FORECAST_FEED_TOKEN</code> as server secrets. Your
              provider must return the format below. Match IDs exactly: Kalshi
              market ticker or Polymarket market ID. AI scores are optional,
              side-specific, and must identify their model.
            </p>
            <pre className="schema">
              {JSON.stringify(
                {
                  forecasts: [
                    {
                      platform: 'kalshi',
                      marketId: 'EXACT-MARKET-TICKER',
                      probabilityYes: 0.65,
                      source: 'Your forecast model',
                      sourceUrl: 'https://your-provider.example/methodology',
                      updatedAt: 'ISO-8601 timestamp',
                      expiresAt: 'ISO-8601 timestamp after update',
                      rationale:
                        'Evidence and assumptions behind this estimate.',
                      ai: { yes: 7.8, no: 2.2, model: 'Your model name' },
                    },
                  ],
                },
                null,
                2,
              )}
            </pre>
          </details>
          <label className="field">
            Or paste forecast JSON
            <textarea
              value={jsonDraft}
              onChange={(e) => setJsonDraft(e.target.value)}
              placeholder='{"forecasts": [...]}'
            />
          </label>
          <Button
            variant="outline"
            onClick={importForecasts}
            disabled={!jsonDraft}
          >
            <Check /> Validate & import
          </Button>
          <p className="muted">
            Imports stay on this device and do not update automatically. Expired
            forecasts are excluded from recommendations.
          </p>
        </DialogContent>
      </Dialog>
      <Dialog open={methodOpen} onOpenChange={setMethodOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-6">
          <DialogTitle className="text-xl">
            How Edgeboard calculates an edge
          </DialogTitle>
          <DialogDescription>
            A screening tool for $1 binary contracts held to settlement.
          </DialogDescription>
          <div className="formula">
            Net gap = (estimated probability − buy price) × 100 − cost allowance
          </div>
          <p className="connection">
            A forecast of 65%, a 55¢ ask, and a 2¢ cost allowance yield +8
            percentage points (8¢ expected profit per share). This depends on
            the forecast being accurate. A 1.5 pp cutoff is strict: exactly 1.5
            pp does not qualify.
          </p>
          <label className="field">
            Estimated total costs per share (cents)
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={cost}
              onChange={(e) =>
                setCost(Math.max(0, Math.min(100, Number(e.target.value) || 0)))
              }
            />
          </label>
          <p className="connection">
            The default 2¢ is an editable assumption, not a verified fee.
            Include fees and slippage for your intended order size. Quotes are
            top-of-book prices, not guaranteed fills; this scanner does not
            calculate order-size depth or actual platform fees.
          </p>
          <div className="section-title">Coverage & freshness</div>
          <p className="connection">
            Scans paginate through public open Kalshi and Polymarket markets and
            stop after 10,000 loaded markets on each platform. Default Kalshi
            coverage excludes combo contracts; Polymarket covers active
            order-book markets and maps YES/NO outcomes only. A scan is not a
            synchronized exchange snapshot. Quotes fetched more than 2 minutes
            ago, ended markets, missing asks, and expired forecasts cannot
            qualify. Markets with connected forecasts receive a separate quote
            refresh every minute. Auto-refresh runs while this page is open and
            may be throttled in background tabs.
          </p>
          <label className="actions connection">
            <Switch
              checked={combos}
              onCheckedChange={(v) => {
                setCombos(v);
                void scan('kalshi', v, true);
              }}
            />{' '}
            Include Kalshi combo markets
          </label>
          <p className="muted">
            Each platform scan stops at 10,000 loaded markets. Categories may be
            inferred from titles. Closing time can differ from actual settlement
            time.
          </p>
          <div className="section-title">AI recommendations</div>
          <p className="connection">
            Scores are 1.0–10.0, supplied separately for YES and NO by the
            connected model. They are not win probabilities and are not
            independently validated by Edgeboard. No connected AI score means
            “Unrated.” Compare evidence in the market details before using a
            rating.
          </p>
          <div className="actions connection">
            <a
              href="https://help.kalshi.com/en/articles/13823805-fees"
              target="_blank"
              rel="noreferrer"
            >
              Kalshi fees ↗
            </a>
            <a
              href="https://docs.polymarket.com/trading/fees"
              target="_blank"
              rel="noreferrer"
            >
              Polymarket fees ↗
            </a>
          </div>
        </DialogContent>
      </Dialog>
      <Sheet open={!!detail} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent className="sm:max-w-xl w-full overflow-y-auto p-7">
          {detail && (
            <>
              <SheetTitle className="text-xl pr-8 leading-relaxed">
                {detail.market.title}
              </SheetTitle>
              <SheetDescription>
                {detail.market.platform === 'kalshi' ? 'Kalshi' : 'Polymarket'}{' '}
                · {detail.side} · {detail.market.category}
                {detail.market.categoryInferred ? ' (inferred)' : ''}
              </SheetDescription>
              <div className="muted mono break-all">{detail.market.id}</div>
              <div className="detail-grid">
                {[
                  ['Buy price', cents(detail.ask)],
                  ['Forecast', pct(detail.p)],
                  ['Raw gap', pp(detail.raw)],
                  ['Net gap', pp(detail.net)],
                  ['AI rating', detail.score?.toFixed(1) ?? 'Unrated'],
                  ['Closes in', duration(detail.market.end, now)],
                ].map(([a, b]) => (
                  <div key={a}>
                    <span>{a}</span>
                    <strong>{b}</strong>
                  </div>
                ))}
              </div>
              <p className="muted">
                Quote fetched{' '}
                {new Date(detail.market.fetchedAt).toLocaleString()}
                {!detail.fresh ? ' · Stale or ended' : ''}. Cost allowance:{' '}
                {cost.toFixed(1)}¢ per share.
              </p>
              {detail.market.quoteWarning && (
                <p className="error">{detail.market.quoteWarning}</p>
              )}
              <div className="section-title">Forecast evidence</div>
              {detail.forecast ? (
                <>
                  <p className="connection">{detail.forecast.rationale}</p>
                  <a
                    className="connection underline"
                    href={detail.forecast.sourceUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {detail.forecast.source} ↗
                  </a>
                  <p className="muted">
                    Updated{' '}
                    {new Date(detail.forecast.updatedAt).toLocaleString()} ·
                    Expires{' '}
                    {new Date(detail.forecast.expiresAt).toLocaleString()}
                    {detail.forecast.ai
                      ? ` · AI model: ${detail.forecast.ai.model}`
                      : ''}
                  </p>
                </>
              ) : (
                <p className="connection">
                  No independent forecast is connected for this market. Its
                  price is not treated as a probability estimate.
                </p>
              )}
              <div className="section-title">Settlement rules</div>
              <div className="rules">
                {detail.market.rules ||
                  'Read the full settlement rules on the exchange before evaluating this contract.'}
              </div>
              <a
                className="exchange-link"
                href={detail.market.url}
                target="_blank"
                rel="noreferrer"
              >
                View on{' '}
                {detail.market.platform === 'kalshi' ? 'Kalshi' : 'Polymarket'}{' '}
                <ArrowUpRight />
              </a>
              <Button variant="outline" onClick={() => toggleStar(detail.key)}>
                <Star />
                {stars.includes(detail.key)
                  ? 'Remove from watchlist'
                  : 'Add to watchlist'}
              </Button>
            </>
          )}
        </SheetContent>
      </Sheet>
    </main>
  );
}
