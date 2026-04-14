import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';

const API_ROUTE_PATH = '/big_batch/completions';
const PROXY_API_URL = `/api${API_ROUTE_PATH}`;
const DEFAULT_API_URL = '';
const DEFAULT_PROMPT = '什么是RWKV？';

const RAIN_CHARS = '人工智能计算机科学分支旨在创造执行通常需要类任务系统是种新线性架构巧妙地结合高效推理并行训练优势处理长序列展现恒定内存占用复杂度使边缘设备大规模发场景下极具潜力本演示张卡上同时路独立生成文互不干扰这吞吐量得益无注意力机制设避免传统模型带来显存瓶颈通过优化算子管将硬件能挥到实际应中可用于支撑海用户对话行为据等速稳延迟低真正多快好省自然语言正快进从早期则统计再如今深学习代表普及民主贡献让我们期待更加未来';

const BASE_GRID_COLUMNS = 20;
const BASE_GRID_ROWS = 16;
const DEFAULT_CONCURRENCY = BASE_GRID_COLUMNS * BASE_GRID_ROWS;
const MAX_CONCURRENCY = 960;
const MAX_CHARS = 120;
const TPS_WINDOW_MS = 2000;
const TPS_UPDATE_INTERVAL_MS = 200;
const TPS_MIN_WINDOW_MS = 100;
const STREAM_DONE_SENTINEL = '[DONE]';
const AUTO_RESUME_MAX_RETRIES = 6;
const AUTO_RESUME_BASE_DELAY_MS = 800;
const AUTO_RESUME_MAX_DELAY_MS = 5000;
const AUTO_MODEL_OPTION = '__auto__';
const CUSTOM_MODEL_OPTION = '__custom__';

interface ThroughputSample {
  timestamp: number;
  tokens: number;
}

interface ModelProbeResult {
  models: string[];
  sourceUrl: string;
}

type ThemeKey = 'matrix' | 'minimal' | 'rain';

interface ThemeConfig {
  label: string;
  description: string;
  renderMode: 'grid' | 'rain';
  bg: string;
  gridBg: string;
  primary: string;
  secondary: string;
  rwkvColor: string;
  rwkvGlow: string;
  buttonStop: string;
  palette: string[];
  swatch: string;
  headerFont: string;
  gridFont: string;
  gridFontSize: string;
  gridLineHeight: string;
  gridLetterSpacing: string;
  headerLetterSpacing: string;
  cursor: string;
  cursorBlinkSpeed: number;
  scanlineColor: string;
  scanlineSize: string;
  scanlineEnabled: boolean;
  glowStrength: string;
  cellGlow: string;
  cellOpacity: number;
  gridBorder: string;
  gridGap: string;
  cellPadding: string;
  cellJustify: 'flex-start' | 'flex-end';
  showCellBorder: boolean;
  cellMaxChars: number;
  animateCellColors: boolean;
  cellHoverFeedback: boolean;
  edgeToEdgeGrid: boolean;
  gridInset: string;
  vignette: boolean;
  noise: boolean;
  crtBlur: boolean;
}

interface RainColumn {
  x: number;
  y: number;
  lastDrawY: number;
  fontSize: number;
  speed: number;
  charIndex: number;
  greenValue: number;
  driftPhase: number;
  driftRate: number;
  fallVariance: number;
  generationVariance: number;
  spacingVariance: number;
  streamIndex: number; // 对应的流索引
}

interface RainSettings {
  displayColumns: number; // 同时显示的列数
  fallSpeed: number;
  generationSpeed: number;
  lineSpacing: number;
  organicVariation: boolean;
}

const DEFAULT_RAIN_SETTINGS: RainSettings = {
  displayColumns: 160,
  fallSpeed: 2.5,
  generationSpeed: 2.5,
  lineSpacing: 2.5,
  organicVariation: true,
};


function createRainColumn(x: number, h: number, stagger: boolean, settings: RainSettings, streamIndex: number): RainColumn {
  const fontSize = 10 + Math.random() * 24;
  const depthRatio = (fontSize - 10) / 24;
  const t = depthRatio * depthRatio;
  const greenValue = Math.floor(12 + t * 243);
  const speed = (0.3 + t * 3) * settings.fallSpeed;

  return {
    x,
    y: stagger ? -(Math.random() * h * 2) : -(fontSize + Math.random() * 40),
    lastDrawY: -Infinity,
    fontSize,
    speed,
    charIndex: 0,
    greenValue,
    driftPhase: Math.random() * Math.PI * 2,
    driftRate: 0.00045 + Math.random() * 0.00075,
    fallVariance: 0.05 + Math.random() * 0.12,
    generationVariance: 0.08 + Math.random() * 0.18,
    spacingVariance: 0.04 + Math.random() * 0.12,
    streamIndex,
  };
}

function createRainColumnsForDisplay(w: number, h: number, settings: RainSettings, initialIndices: number[]): RainColumn[] {
  const count = initialIndices.length;
  const spacing = w / count;

  return initialIndices.map((streamIndex, colIndex) => {
    const jitter = Math.max(2, spacing - 2);
    const x = Math.min(w - 2, colIndex * spacing + Math.random() * jitter);
    return createRainColumn(x, h, true, settings, streamIndex);
  });
}

const THEMES: Record<ThemeKey, ThemeConfig> = {
  matrix: {
    label: 'MATRIX',
    description: 'Classic terminal',
    renderMode: 'grid',
    bg: '#000000',
    gridBg: '#002200',
    primary: '#00FF41',
    secondary: '#008F11',
    rwkvColor: '#FFFFFF',
    rwkvGlow: '0 0 10px rgba(255,255,255,0.8), 0 0 20px rgba(255,255,255,0.4)',
    buttonStop: '#FF003C',
    palette: ['#00FF41', '#008F11', '#03A062', '#2E8B57', '#3CB371', '#00FA9A'],
    swatch: '#00FF41',
    headerFont: '"Courier New", Courier, Consolas, monospace',
    gridFont: '"Courier New", Courier, Consolas, monospace',
    gridFontSize: '10px',
    gridLineHeight: '1.2',
    gridLetterSpacing: '0px',
    headerLetterSpacing: '0.15em',
    cursor: '█',
    cursorBlinkSpeed: 400,
    scanlineColor: 'rgba(0,255,65,0.03)',
    scanlineSize: '4px',
    scanlineEnabled: true,
    glowStrength: '0 0 3px currentColor',
    cellGlow: '',
    cellOpacity: 0.8,
    gridBorder: '1px solid rgba(0,255,65,0.2)',
    gridGap: '1px',
    cellPadding: '4px',
    cellJustify: 'flex-end',
    showCellBorder: true,
    cellMaxChars: 120,
    animateCellColors: true,
    cellHoverFeedback: true,
    edgeToEdgeGrid: false,
    gridInset: '0px',
    vignette: false,
    noise: false,
    crtBlur: false,
  },
  minimal: {
    label: 'MINIMAL_DENSE',
    description: 'Quiet mosaic',
    renderMode: 'grid',
    bg: '#0b0f14',
    gridBg: '#0b0f14',
    primary: '#d6dde8',
    secondary: '#7f8b9f',
    rwkvColor: '#f5f7fa',
    rwkvGlow: '',
    buttonStop: '#d97706',
    palette: ['#eef2f7', '#2f6fd6', '#148575'],
    swatch: '#d6dde8',
    headerFont: '"IBM Plex Mono", "Noto Sans Mono", monospace',
    gridFont: '"Noto Sans Mono", "IBM Plex Mono", monospace',
    gridFontSize: '8px',
    gridLineHeight: '9px',
    gridLetterSpacing: '1px',
    headerLetterSpacing: '0.08em',
    cursor: '▌',
    cursorBlinkSpeed: 520,
    scanlineColor: 'transparent',
    scanlineSize: '0px',
    scanlineEnabled: false,
    glowStrength: '',
    cellGlow: '',
    cellOpacity: 0.96,
    gridBorder: 'none',
    gridGap: '1px',
    cellPadding: '0px',
    cellJustify: 'flex-start',
    showCellBorder: false,
    cellMaxChars: 320,
    animateCellColors: false,
    cellHoverFeedback: false,
    edgeToEdgeGrid: true,
    gridInset: '1px',
    vignette: false,
    noise: false,
    crtBlur: false,
  },
  rain: {
    label: 'DIGITAL_RAIN',
    description: 'Depth parallax',
    renderMode: 'rain',
    bg: '#000000',
    gridBg: '#000000',
    primary: '#00FF41',
    secondary: '#008F11',
    rwkvColor: '#FFFFFF',
    rwkvGlow: '',
    buttonStop: '#FF003C',
    palette: ['#00FF41'],
    swatch: '#00FF41',
    headerFont: '"Courier New", Courier, Consolas, monospace',
    gridFont: 'monospace',
    gridFontSize: '10px',
    gridLineHeight: '1.2',
    gridLetterSpacing: '0px',
    headerLetterSpacing: '0.15em',
    cursor: '█',
    cursorBlinkSpeed: 400,
    scanlineColor: '',
    scanlineSize: '0px',
    scanlineEnabled: false,
    glowStrength: '',
    cellGlow: '',
    cellOpacity: 1,
    gridBorder: 'none',
    gridGap: '0px',
    cellPadding: '0px',
    cellJustify: 'flex-end',
    showCellBorder: false,
    cellMaxChars: 120,
    animateCellColors: false,
    cellHoverFeedback: false,
    edgeToEdgeGrid: true,
    gridInset: '0px',
    vignette: false,
    noise: false,
    crtBlur: false,
  },
};

const THEME_KEYS: ThemeKey[] = ['matrix', 'minimal', 'rain'];

function formatThreadLabel(index: number) {
  return `THREAD_${String(index + 1).padStart(3, '0')}`;
}

function estimateDisplayTokens(text: string) {
  let count = 0;
  let index = 0;

  while (index < text.length) {
    const char = text[index];

    if (/\s/u.test(char)) {
      count += 1;
      index += 1;
      continue;
    }

    const wordMatch = text.slice(index).match(/^[A-Za-z0-9]+(?:['’_-][A-Za-z0-9]+)*/);
    if (wordMatch) {
      count += 1;
      index += wordMatch[0].length;
      continue;
    }

    const codePoint = text.codePointAt(index);
    if (codePoint === undefined) {
      break;
    }

    const symbol = String.fromCodePoint(codePoint);
    count += 1;
    index += symbol.length;
  }

  return count;
}

function normalizeApiUrl(rawEndpoint: string) {
  const trimmedEndpoint = rawEndpoint.trim();

  if (!trimmedEndpoint) {
    return DEFAULT_API_URL;
  }

  const hasProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmedEndpoint);
  const isRelativePath = trimmedEndpoint.startsWith('/');
  const candidate = hasProtocol || isRelativePath ? trimmedEndpoint : `http://${trimmedEndpoint}`;
  const baseOrigin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
  const normalizedUrl = new URL(candidate, baseOrigin);

  if (normalizedUrl.pathname === '/' || normalizedUrl.pathname === '') {
    normalizedUrl.pathname = API_ROUTE_PATH;
  } else if (normalizedUrl.pathname === '/api' || normalizedUrl.pathname === '/api/') {
    normalizedUrl.pathname = PROXY_API_URL;
  }

  if (isRelativePath) {
    return `${normalizedUrl.pathname}${normalizedUrl.search}${normalizedUrl.hash}`;
  }

  return normalizedUrl.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function buildApiKeyHeaders(apiKey: string) {
  const trimmedApiKey = apiKey.trim();

  if (!trimmedApiKey) {
    return {};
  }

  return {
    Authorization: `Bearer ${trimmedApiKey}`,
    'x-api-key': trimmedApiKey,
    'api-key': trimmedApiKey,
  };
}


function normalizeHardwareValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmedValue = value.trim();
    return trimmedValue || undefined;
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => normalizeHardwareValue(item))
      .filter((item): item is string => Boolean(item));

    return parts.length > 0 ? parts.join(' / ') : undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  for (const key of ['name', 'label', 'display_name', 'displayName', 'device_name', 'gpu_name', 'gpu_model']) {
    const nextValue = normalizeHardwareValue(value[key]);
    if (nextValue) {
      return nextValue;
    }
  }

  return undefined;
}

function extractHardwareLabel(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  for (const key of [
    'hardware',
    'hardware_name',
    'hardware_label',
    'device_name',
    'device_label',
    'gpu_name',
    'gpu_model',
    'gpu',
    'device',
    'accelerator',
    'accelerator_name',
  ]) {
    const value = normalizeHardwareValue(payload[key]);
    if (value) {
      return value;
    }
  }

  for (const key of ['hardware_info', 'gpu_info', 'device_info', 'system_info']) {
    const value = normalizeHardwareValue(payload[key]);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function buildModelProbeUrls(apiUrl: string) {
  const baseOrigin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
  const normalizedUrl = new URL(apiUrl, baseOrigin);
  const isRelativePath = apiUrl.startsWith('/');
  const pathname = normalizedUrl.pathname.replace(/\/+$/, '') || '/';
  const candidates: string[] = [];

  const pushCandidate = (targetPath: string) => {
    const cleanedPath = targetPath.replace(/\/{2,}/g, '/');
    const nextUrl = new URL(normalizedUrl.toString());
    nextUrl.pathname = cleanedPath.startsWith('/') ? cleanedPath : `/${cleanedPath}`;
    nextUrl.search = '';
    nextUrl.hash = '';
    const value = isRelativePath
      ? `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
      : nextUrl.toString();

    if (!candidates.includes(value)) {
      candidates.push(value);
    }
  };

  if (pathname.startsWith('/api/')) {
    pushCandidate('/api/v1/models');
    pushCandidate('/api/models');
  }

  const v1Index = pathname.indexOf('/v1/');
  if (v1Index >= 0) {
    const prefix = pathname.slice(0, v1Index);
    pushCandidate(`${prefix}/v1/models`);
  }

  const completionSuffixes = [
    '/v1/chat/completions',
    '/chat/completions',
    '/v1/completions',
    '/completions',
    '/v1/big_batch/completions',
    '/big_batch/completions',
  ];

  for (const suffix of completionSuffixes) {
    if (pathname.endsWith(suffix)) {
      const prefix = pathname.slice(0, pathname.length - suffix.length);
      pushCandidate(`${prefix}/v1/models`);
      pushCandidate(`${prefix}/models`);
    }
  }

  pushCandidate('/v1/models');
  pushCandidate('/models');

  return candidates;
}

function extractModelIds(payload: unknown) {
  const models = new Set<string>();

  const visit = (value: unknown, fromCollection = false, depth = 0) => {
    if (depth > 5 || value == null) {
      return;
    }

    if (typeof value === 'string') {
      if (fromCollection && value.trim()) {
        models.add(value.trim());
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, true, depth + 1);
      }
      return;
    }

    if (!isRecord(value)) {
      return;
    }

    if (
      typeof value.id === 'string'
      && (
        value.object === 'model'
        || 'owned_by' in value
        || 'permission' in value
        || 'root' in value
      )
    ) {
      models.add(value.id.trim());
    }

    if (fromCollection && typeof value.model === 'string' && value.model.trim()) {
      models.add(value.model.trim());
    }

    if (fromCollection && typeof value.name === 'string' && value.name.trim() && !('data' in value)) {
      models.add(value.name.trim());
    }

    for (const key of ['data', 'models', 'items', 'results']) {
      if (key in value) {
        visit(value[key], true, depth + 1);
      }
    }
  };

  visit(payload);
  return Array.from(models);
}

async function detectAvailableModels(apiUrl: string, apiKey: string, signal?: AbortSignal): Promise<ModelProbeResult> {
  let lastError = '未找到可用的模型列表接口';

  for (const candidateUrl of buildModelProbeUrls(apiUrl)) {
    try {
      const response = await fetch(candidateUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...buildApiKeyHeaders(apiKey),
        },
        signal,
      });

      if (!response.ok) {
        lastError = `${candidateUrl} 返回 ${response.status}`;
        continue;
      }

      const rawText = await response.text();
      let payload: unknown;

      try {
        payload = JSON.parse(rawText);
      } catch {
        lastError = `${candidateUrl} 返回的不是 JSON`;
        continue;
      }

      const models = dedupeStrings(extractModelIds(payload));
      if (models.length > 0) {
        return {
          models,
          sourceUrl: candidateUrl,
        };
      }

      lastError = `${candidateUrl} 未返回可识别的模型列表`;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw error;
      }

      lastError = error instanceof Error
        ? `${candidateUrl} · ${error.message}`
        : `${candidateUrl} · 模型探测失败`;
    }
  }

  throw new Error(lastError);
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function getAutoResumeDelayMs(attempt: number) {
  return Math.min(
    AUTO_RESUME_MAX_DELAY_MS,
    AUTO_RESUME_BASE_DELAY_MS * (2 ** Math.max(0, attempt - 1)),
  );
}

function buildBatchContents(prompt: string, concurrency: number, existingBuffers: string[]) {
  const prefilledText = `User: ${prompt}\n\nAssistant: <think>\n</think>`;
  return Array.from({ length: concurrency }, (_, index) => `${prefilledText}${existingBuffers[index] || ''}`);
}

function describeRequestError(error: unknown, apiUrl: string) {
  if (error instanceof Error && error.message === 'Failed to fetch') {
    const hints: string[] = [];

    if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
      hints.push('你现在像是直接打开了本地 `index.html` 文件。');
    }

    if (apiUrl.startsWith('/api')) {
      hints.push('当前请求的是相对地址 `/api/...`，它需要 `npm run dev` 或 `npm run serve` 提供代理。');
    }

    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && apiUrl.startsWith('http://')) {
      hints.push('当前页面是 HTTPS，但 API 是 HTTP，浏览器会拦截这类混合内容请求。');
    }

    if (hints.length > 0) {
      return `Failed to fetch。${hints.join(' ')}`;
    }

    return 'Failed to fetch。请检查 API 地址、网络连通性，以及浏览器的 CORS / mixed-content 限制。';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return '请求失败，请检查 API 地址与服务状态';
}

export default function App() {
  const [isRunning, setIsRunning] = useState(false);
  const [themeKey, setThemeKey] = useState<ThemeKey>('minimal');
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [rainSettingsOpen, setRainSettingsOpen] = useState(false);
  const [rainSettings, setRainSettings] = useState<RainSettings>(DEFAULT_RAIN_SETTINGS);
  const [apiSettingsOpen, setApiSettingsOpen] = useState(false);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [customEndpoint, setCustomEndpoint] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiPasswordInput, setApiPasswordInput] = useState('');
  const [customHardwareName, setCustomHardwareName] = useState('');
  const [backendHardwareName, setBackendHardwareName] = useState('');
  const [requestError, setRequestError] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelSelectValue, setModelSelectValue] = useState(AUTO_MODEL_OPTION);
  const [customModelName, setCustomModelName] = useState('');
  const [modelProbeStatus, setModelProbeStatus] = useState<'idle' | 'probing' | 'success' | 'error'>('idle');
  const [modelProbeMessage, setModelProbeMessage] = useState('');
  const [modelProbeSourceUrl, setModelProbeSourceUrl] = useState('');
  const [connectionNotice, setConnectionNotice] = useState('');
  const [promptText, setPromptText] = useState(DEFAULT_PROMPT);
  const [concurrency, setConcurrency] = useState(DEFAULT_CONCURRENCY);
  const [throughput, setThroughput] = useState<string>('--');
  const [memoryUsage, setMemoryUsage] = useState<string>('--');
  const [selectedThreadIndex, setSelectedThreadIndex] = useState<number | null>(null);
  const [selectedThreadText, setSelectedThreadText] = useState('');
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const rainSettingsRef = useRef<HTMLDivElement>(null);
  const apiSettingsRef = useRef<HTMLDivElement>(null);
  const textRefs = useRef<(HTMLDivElement | null)[]>([]);
  const themeRef = useRef(THEMES[themeKey]);
  const rainCanvasRef = useRef<HTMLCanvasElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const modelProbeAbortRef = useRef<AbortController | null>(null);
  const modelProbeCacheRef = useRef<Map<string, ModelProbeResult>>(new Map());
  const manualStopRef = useRef(false);
  const streamBuffersRef = useRef<string[]>(Array(MAX_CONCURRENCY).fill(''));
  const generatedTokenCountsRef = useRef<number[]>(Array(MAX_CONCURRENCY).fill(0));
  const rainTextRef = useRef<string>('');
  const throughputSamplesRef = useRef<ThroughputSample[]>([]);
  const statsRef = useRef({ firstTokenReceived: false });

  const theme = THEMES[themeKey];
  const highlightRWKVCells = themeKey !== 'minimal';
  const isRainMode = theme.renderMode === 'rain';
  const resolvedApiUrl = useMemo(() => normalizeApiUrl(customEndpoint), [customEndpoint]);
  const resolvedApiKey = useMemo(() => apiKeyInput.trim(), [apiKeyInput]);
  const resolvedApiPassword = useMemo(() => apiPasswordInput.trim(), [apiPasswordInput]);
  const resolvedHardwareLabel = useMemo(() => {
    const manualName = customHardwareName.trim();
    if (manualName) {
      return manualName;
    }

    return backendHardwareName || 'AUTO';
  }, [backendHardwareName, customHardwareName]);
  const resolvedRequestModel = useMemo(() => {
    if (modelSelectValue === CUSTOM_MODEL_OPTION) {
      const trimmedModelName = customModelName.trim();
      return trimmedModelName || undefined;
    }

    if (modelSelectValue === AUTO_MODEL_OPTION) {
      return undefined;
    }

    return modelSelectValue;
  }, [customModelName, modelSelectValue]);
  const selectableModels = useMemo(() => {
    if (
      modelSelectValue
      && modelSelectValue !== AUTO_MODEL_OPTION
      && modelSelectValue !== CUSTOM_MODEL_OPTION
      && !availableModels.includes(modelSelectValue)
    ) {
      return [modelSelectValue, ...availableModels];
    }

    return availableModels;
  }, [availableModels, modelSelectValue]);
  const gridMetrics = useMemo(() => {
    const cellCount = Math.max(1, concurrency);

    if (cellCount <= DEFAULT_CONCURRENCY) {
      const aspectRatio = BASE_GRID_COLUMNS / BASE_GRID_ROWS;
      let columns = Math.max(
        1,
        Math.min(cellCount, BASE_GRID_COLUMNS, Math.ceil(Math.sqrt(cellCount * aspectRatio))),
      );
      let rows = Math.ceil(cellCount / columns);

      while (rows > BASE_GRID_ROWS && columns < BASE_GRID_COLUMNS) {
        columns += 1;
        rows = Math.ceil(cellCount / columns);
      }

      return {
        cellCount,
        columns,
        rows,
        shouldScroll: false,
        heightPercent: 100,
      };
    }

    const columns = BASE_GRID_COLUMNS;
    const rows = Math.ceil(cellCount / columns);

    return {
      cellCount,
      columns,
      rows,
      shouldScroll: true,
      heightPercent: (rows / BASE_GRID_ROWS) * 100,
    };
  }, [concurrency]);

  const gridCellCount = gridMetrics.cellCount;
  const gridColumns = gridMetrics.columns;
  const gridRows = gridMetrics.rows;
  const gridShouldScroll = gridMetrics.shouldScroll;
  const gridHeightPercent = gridMetrics.heightPercent;
  const getPaletteIndexForCell = useCallback((index: number, paletteLength: number, fallbackIndex: number) => {
    if (paletteLength === 0) return 0;

    if (themeKey !== 'minimal') {
      return ((fallbackIndex % paletteLength) + paletteLength) % paletteLength;
    }

    const row = Math.floor(index / gridColumns);
    const col = index % gridColumns;

    return (row + col + 1) % Math.min(3, paletteLength);
  }, [gridColumns, themeKey]);

  const selectedThreadLabel = selectedThreadIndex === null ? '' : formatThreadLabel(selectedThreadIndex);
  const modalTextColor = '#F5F7FA';
  const modalMutedTextColor = 'rgba(245, 247, 250, 0.72)';
  const modalSoftBorderColor = 'rgba(245, 247, 250, 0.22)';
  const modalSurfaceColor = 'rgba(245, 247, 250, 0.06)';
  const markdownComponents = useMemo(() => ({
    h1: ({ children, ...props }: React.ComponentProps<'h1'>) => (
      <h1 className="thread-markdown__h1" style={{ fontFamily: theme.headerFont }} {...props}>{children}</h1>
    ),
    h2: ({ children, ...props }: React.ComponentProps<'h2'>) => (
      <h2 className="thread-markdown__h2" style={{ fontFamily: theme.headerFont }} {...props}>{children}</h2>
    ),
    h3: ({ children, ...props }: React.ComponentProps<'h3'>) => (
      <h3 className="thread-markdown__h3" style={{ fontFamily: theme.headerFont }} {...props}>{children}</h3>
    ),
    p: ({ children, ...props }: React.ComponentProps<'p'>) => (
      <p className="thread-markdown__p" {...props}>{children}</p>
    ),
    ul: ({ children, ...props }: React.ComponentProps<'ul'>) => (
      <ul className="thread-markdown__ul" {...props}>{children}</ul>
    ),
    ol: ({ children, ...props }: React.ComponentProps<'ol'>) => (
      <ol className="thread-markdown__ol" {...props}>{children}</ol>
    ),
    li: ({ children, ...props }: React.ComponentProps<'li'>) => (
      <li className="thread-markdown__li" {...props}>{children}</li>
    ),
    blockquote: ({ children, ...props }: React.ComponentProps<'blockquote'>) => (
      <blockquote
        className="thread-markdown__blockquote"
        style={{ borderLeftColor: modalSoftBorderColor, backgroundColor: modalSurfaceColor }}
        {...props}
      >
        {children}
      </blockquote>
    ),
    a: ({ children, ...props }: React.ComponentProps<'a'>) => (
      <a className="thread-markdown__link" style={{ color: modalTextColor }} target="_blank" rel="noreferrer" {...props}>
        {children}
      </a>
    ),
    table: ({ children, ...props }: React.ComponentProps<'table'>) => (
      <div className="thread-markdown__table-wrap">
        <table className="thread-markdown__table" {...props}>{children}</table>
      </div>
    ),
    th: ({ children, ...props }: React.ComponentProps<'th'>) => (
      <th className="thread-markdown__th" style={{ borderColor: modalSoftBorderColor, backgroundColor: modalSurfaceColor }} {...props}>{children}</th>
    ),
    td: ({ children, ...props }: React.ComponentProps<'td'>) => (
      <td className="thread-markdown__td" style={{ borderColor: modalSoftBorderColor }} {...props}>{children}</td>
    ),
    hr: (props: React.ComponentProps<'hr'>) => (
      <hr className="thread-markdown__hr" style={{ borderColor: modalSoftBorderColor }} {...props} />
    ),
    code: ({ children, className, ...props }: React.ComponentProps<'code'>) => {
      const isBlock = Boolean(className);
      if (isBlock) {
        return (
          <code
            className={`thread-markdown__code thread-markdown__code--block ${className || ''}`.trim()}
            style={{ color: modalTextColor }}
            {...props}
          >
            {children}
          </code>
        );
      }
      return (
        <code
          className="thread-markdown__code thread-markdown__code--inline"
          style={{ color: modalTextColor, backgroundColor: modalSurfaceColor }}
          {...props}
        >
          {children}
        </code>
      );
    },
    pre: ({ children, ...props }: React.ComponentProps<'pre'>) => (
      <pre
        className="thread-markdown__pre"
        style={{ borderColor: modalSoftBorderColor, backgroundColor: modalSurfaceColor }}
        {...props}
      >
        {children}
      </pre>
    ),
  }), [modalSoftBorderColor, modalSurfaceColor, modalTextColor, theme]);

  const openThreadModal = useCallback((index: number) => {
    if (index >= concurrency) return;
    setSelectedThreadIndex(index);
    setSelectedThreadText(streamBuffersRef.current[index] || '');
  }, [concurrency]);

  const closeThreadModal = useCallback(() => {
    setSelectedThreadIndex(null);
  }, [getPaletteIndexForCell]);

  const updateThroughput = useCallback((now = performance.now()) => {
    const samples = throughputSamplesRef.current;

    while (samples.length > 0 && now - samples[0].timestamp > TPS_WINDOW_MS) {
      samples.shift();
    }

    if (samples.length === 0) {
      setThroughput(statsRef.current.firstTokenReceived ? '0 T/S' : '--');
      return;
    }

    const tokensInWindow = samples.reduce((total, sample) => total + sample.tokens, 0);
    const elapsedMs = Math.max(
      TPS_MIN_WINDOW_MS,
      Math.min(TPS_WINDOW_MS, now - samples[0].timestamp),
    );
    const tps = tokensInWindow / (elapsedMs / 1000);

    setThroughput(`~${Math.round(tps).toLocaleString()} T/S`);
  }, []);

  const probeAvailableModels = useCallback(async (apiUrl: string, forceRefresh = false) => {
    const trimmedApiUrl = apiUrl.trim();

    if (!trimmedApiUrl) {
      setAvailableModels([]);
      setModelProbeStatus('idle');
      setModelProbeMessage('');
      setModelProbeSourceUrl('');
      return;
    }

    if (modelProbeAbortRef.current) {
      modelProbeAbortRef.current.abort();
      modelProbeAbortRef.current = null;
    }

    if (!forceRefresh) {
      const cachedResult = modelProbeCacheRef.current.get(trimmedApiUrl);
      if (cachedResult) {
        setAvailableModels(cachedResult.models);
        setModelProbeStatus('success');
        setModelProbeMessage(`检测到 ${cachedResult.models.length} 个模型`);
        setModelProbeSourceUrl(cachedResult.sourceUrl);
        return;
      }
    }

    const controller = new AbortController();
    modelProbeAbortRef.current = controller;
    setModelProbeStatus('probing');
    setModelProbeMessage('正在检测可用模型…');
    setModelProbeSourceUrl('');

    try {
      const result = await detectAvailableModels(trimmedApiUrl, resolvedApiKey, controller.signal);
      if (controller.signal.aborted) {
        return;
      }

      modelProbeCacheRef.current.set(trimmedApiUrl, result);
      setAvailableModels(result.models);
      setModelProbeStatus('success');
      setModelProbeMessage(`检测到 ${result.models.length} 个模型`);
      setModelProbeSourceUrl(result.sourceUrl);
    } catch (error) {
      if ((error as Error).name === 'AbortError' || controller.signal.aborted) {
        return;
      }

      setAvailableModels([]);
      setModelProbeStatus('error');
      setModelProbeMessage(error instanceof Error ? error.message : '模型检测失败');
      setModelProbeSourceUrl('');
    } finally {
      if (modelProbeAbortRef.current === controller) {
        modelProbeAbortRef.current = null;
      }
    }
  }, [resolvedApiKey]);

  const startStreaming = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    manualStopRef.current = false;
    streamBuffersRef.current = Array(MAX_CONCURRENCY).fill('');
    generatedTokenCountsRef.current = Array(MAX_CONCURRENCY).fill(0);
    rainTextRef.current = '';

    throughputSamplesRef.current = [];
    statsRef.current = { firstTokenReceived: false };
    setThroughput('--');
    setMemoryUsage('--');
    setBackendHardwareName('');
    setRequestError('');
    setConnectionNotice('');

    for (let i = 0; i < MAX_CONCURRENCY; i++) {
      const ref = textRefs.current[i];
      if (ref) {
        ref.textContent = '';
        ref.scrollTop = 0;
      }
      stateRefs.current[i].text = '';
    }

    let reconnectAttempt = 0;

    while (!manualStopRef.current) {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const generatedCounts = generatedTokenCountsRef.current.slice(0, concurrency);
      const consumedBudget = generatedCounts.length > 0 ? Math.max(...generatedCounts) : 0;
      const requestMaxTokens = reconnectAttempt === 0
        ? maxTokens
        : Math.max(1, maxTokens - consumedBudget);

      let sawDoneMarker = false;
      let reconnectReason = '流式响应在收到 [DONE] 前提前结束。';

      try {
        if (!resolvedApiUrl) {
          throw new Error('请先在设置里填写 API URL。');
        }

        const contents = buildBatchContents(promptText, concurrency, streamBuffersRef.current);

        const response = await fetch(resolvedApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...buildApiKeyHeaders(resolvedApiKey),
          },
          body: JSON.stringify({
            contents,
            ...(resolvedRequestModel ? { model: resolvedRequestModel } : {}),
            ...(resolvedApiPassword ? { password: resolvedApiPassword } : {}),
            max_tokens: requestMaxTokens,
            stop_tokens: [0, 261, 24281],
            temperature: 1.0,
            chunk_size: 1,
            stream: true,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`请求失败：${response.status}${response.statusText ? ` ${response.statusText}` : ''}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No reader available');
        }

        if (reconnectAttempt > 0) {
          setConnectionNotice('');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;

            const dataStr = line.slice(6).trim();
            if (dataStr === STREAM_DONE_SENTINEL) {
              sawDoneMarker = true;
              break;
            }

            try {
              const data = JSON.parse(dataStr);

              if (data.memory_gb !== undefined) {
                setMemoryUsage(`${data.memory_gb.toFixed(1)}_GB`);
              }

              const nextHardwareLabel = extractHardwareLabel(data);
              if (nextHardwareLabel) {
                setBackendHardwareName((previousValue) => previousValue === nextHardwareLabel ? previousValue : nextHardwareLabel);
              }

              if (data.choices && Array.isArray(data.choices)) {
                let tokensInBatch = 0;
                for (const choice of data.choices) {
                  const index = choice.index;
                  const text = choice.delta?.content || choice.text || '';
                  if (index !== undefined && index < concurrency) {
                    streamBuffersRef.current[index] += text;
                    stateRefs.current[index].text = streamBuffersRef.current[index];

                    if (text && isRainMode) {
                      rainTextRef.current += text;
                    }

                    if (text.length > 0) {
                      const estimatedTokens = estimateDisplayTokens(text);
                      generatedTokenCountsRef.current[index] += estimatedTokens;
                      tokensInBatch += estimatedTokens;
                    }
                  }
                }

                if (tokensInBatch > 0) {
                  if (!statsRef.current.firstTokenReceived) {
                    statsRef.current.firstTokenReceived = true;
                  }

                  const now = performance.now();
                  throughputSamplesRef.current.push({ timestamp: now, tokens: tokensInBatch });
                  updateThroughput(now);
                }
              }
            } catch {
              // Skip invalid JSON
            }
          }

          if (sawDoneMarker) {
            break;
          }
        }

        const tailLine = buffer.trim();
        if (!sawDoneMarker && tailLine.startsWith('data: ')) {
          const tailData = tailLine.slice(6).trim();
          if (tailData === STREAM_DONE_SENTINEL) {
            sawDoneMarker = true;
          }
        }

        if (sawDoneMarker) {
          abortControllerRef.current = null;
          setConnectionNotice('');
          setRequestError('');
          setIsRunning(false);
          return;
        }
      } catch (error) {
        abortControllerRef.current = null;

        if ((error as Error).name === 'AbortError') {
          return;
        }

        reconnectReason = describeRequestError(error, resolvedApiUrl);
        console.error('Streaming error:', error);
      }

      abortControllerRef.current = null;

      if (manualStopRef.current) {
        return;
      }

      if (reconnectAttempt >= AUTO_RESUME_MAX_RETRIES) {
        setConnectionNotice('');
        setRequestError(`${reconnectReason} 自动补跑已达到上限，任务已停止。`);
        setIsRunning(false);
        return;
      }

      reconnectAttempt += 1;
      const delayMs = getAutoResumeDelayMs(reconnectAttempt);
      const completedStreams = streamBuffersRef.current.slice(0, concurrency).filter((value) => value.length > 0).length;

      setConnectionNotice(
        `STREAM_INTERRUPTED · 自动补跑 ${reconnectAttempt}/${AUTO_RESUME_MAX_RETRIES} · ${delayMs}ms 后重连 · 已保留 ${completedStreams}/${concurrency} 路输出`,
      );

      await wait(delayMs);
    }
  }, [promptText, concurrency, isRainMode, maxTokens, resolvedApiKey, resolvedApiPassword, resolvedApiUrl, resolvedRequestModel, updateThroughput]);

  const stopStreaming = useCallback(() => {
    manualStopRef.current = true;
    setConnectionNotice('');

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!apiSettingsOpen) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      void probeAvailableModels(resolvedApiUrl);
    }, customEndpoint.trim() ? 600 : 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [apiSettingsOpen, customEndpoint, probeAvailableModels, resolvedApiUrl]);

  useEffect(() => () => {
    if (modelProbeAbortRef.current) {
      modelProbeAbortRef.current.abort();
      modelProbeAbortRef.current = null;
    }
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      updateThroughput();
    }, TPS_UPDATE_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [updateThroughput]);

  useEffect(() => {
    if (isRunning) {
      startStreaming();
    } else {
      stopStreaming();
    }
    return () => {
      stopStreaming();
    };
  }, [isRunning, startStreaming, stopStreaming]);

  const RWKV_INDICES = new Set([
    // R
    ...[1,2,3,4,5,6,7,8,9,10,11,12,13,14].map(r => r*20+0),
    1*20+1, 1*20+2,
    ...[2,3,4,5,6].map(r => r*20+3),
    7*20+1, 7*20+2,
    8*20+1, 9*20+1, 10*20+2, 11*20+2, 12*20+3, 13*20+3, 14*20+3,
    // W
    ...[1,2,3,4,5,6,7,8,9,10,11,12].map(r => r*20+5),
    ...[1,2,3,4,5,6,7,8,9,10,11,12].map(r => r*20+9),
    ...[7,8,9,10,11,12].map(r => r*20+7),
    13*20+6, 14*20+6, 13*20+8, 14*20+8,
    // K
    ...[1,2,3,4,5,6,7,8,9,10,11,12,13,14].map(r => r*20+11),
    ...[1,2,3,4,5].map(r => r*20+13),
    ...[6,7,8,9].map(r => r*20+12),
    ...[10,11,12,13,14].map(r => r*20+13),
    // V
    ...[1,2,3,4,5,6].map(r => r*20+15),
    ...[1,2,3,4,5,6].map(r => r*20+19),
    ...[7,8,9,10,11,12].map(r => r*20+16),
    ...[7,8,9,10,11,12].map(r => r*20+18),
    13*20+17, 14*20+17
  ]);

  const stateRefs = useRef(Array.from({ length: MAX_CONCURRENCY }).map((_, i) => {
    const isRWKV = RWKV_INDICES.has(i);
    return {
      text: '',
      isRWKV,
      colorIndex: Math.floor(Math.random() * 6),
      colorCycleInterval: 800 + Math.random() * 1200,
      lastColorChange: performance.now() + Math.random() * 2000
    };
  }));

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    if (isRunning) return;

    for (let i = concurrency; i < MAX_CONCURRENCY; i++) {
      streamBuffersRef.current[i] = '';
      stateRefs.current[i].text = '';

      const ref = textRefs.current[i];
      if (ref) {
        ref.textContent = '';
        ref.scrollTop = 0;
      }
    }
  }, [concurrency, isRunning]);

  const applyThemeToBlocks = useCallback((t: ThemeConfig) => {
    if (t.renderMode !== 'grid') return;
    for (let i = 0; i < MAX_CONCURRENCY; i++) {
      const ref = textRefs.current[i];
      if (!ref) continue;
      const state = stateRefs.current[i];
      if (state.isRWKV && t !== THEMES.minimal) {
        ref.style.color = t.rwkvColor;
        ref.style.textShadow = t.rwkvGlow;
        ref.style.fontWeight = 'bold';
      } else {
        ref.style.color = t.palette[getPaletteIndexForCell(i, t.palette.length, state.colorIndex)];
        ref.style.textShadow = t.glowStrength;
        ref.style.fontWeight = 'normal';
      }
      ref.style.fontFamily = t.gridFont;
      ref.style.fontSize = t.gridFontSize;
      ref.style.lineHeight = t.gridLineHeight;
      ref.style.letterSpacing = t.gridLetterSpacing;
      ref.style.wordSpacing = t.gridLetterSpacing;
      ref.style.filter = t.crtBlur ? 'blur(0.3px)' : 'none';
    }
  }, [getPaletteIndexForCell]);

  useEffect(() => {
    applyThemeToBlocks(theme);
  }, [theme, applyThemeToBlocks]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setThemeMenuOpen(false);
      }
      if (rainSettingsRef.current && !rainSettingsRef.current.contains(e.target as Node)) {
        setRainSettingsOpen(false);
      }
      if (apiSettingsRef.current && !apiSettingsRef.current.contains(e.target as Node)) {
        setApiSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!isRainMode) {
      setRainSettingsOpen(false);
    }
  }, [isRainMode]);

  useEffect(() => {
    if (selectedThreadIndex === null) return;

    let animationFrameId = 0;
    let lastText = streamBuffersRef.current[selectedThreadIndex] || '';
    setSelectedThreadText(lastText);

    const syncSelectedThread = () => {
      const nextText = streamBuffersRef.current[selectedThreadIndex] || '';
      if (nextText !== lastText) {
        lastText = nextText;
        setSelectedThreadText(nextText);
      }
      animationFrameId = requestAnimationFrame(syncSelectedThread);
    };

    animationFrameId = requestAnimationFrame(syncSelectedThread);
    return () => cancelAnimationFrame(animationFrameId);
  }, [selectedThreadIndex]);

  useEffect(() => {
    if (selectedThreadIndex !== null && selectedThreadIndex >= concurrency) {
      closeThreadModal();
    }
  }, [closeThreadModal, concurrency, selectedThreadIndex]);

  useEffect(() => {
    if (selectedThreadIndex === null) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeThreadModal();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeThreadModal, selectedThreadIndex]);

  // Grid animation - displays streamed text from API (runs while streaming)
  useEffect(() => {
    if (!isRunning || THEMES[themeKey].renderMode !== 'grid') return;

    let animationFrameId: number;
    let lastTime = performance.now();

    const update = (time: number) => {
      const deltaTime = time - lastTime;

      if (deltaTime > 40) {
        lastTime = time;

        for (let i = 0; i < gridCellCount; i++) {
          const state = stateRefs.current[i];
          const ref = textRefs.current[i];

          if (ref) {
            const text = state.text;
            const displayLimit = themeRef.current.cellMaxChars;
            const displayText = text.length > displayLimit ? text.slice(-displayLimit) : text;
            ref.textContent = displayText;
            ref.scrollTop = ref.scrollHeight;
          }
        }
      }

      animationFrameId = requestAnimationFrame(update);
    };

    animationFrameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationFrameId);
  }, [gridCellCount, isRunning, themeKey]);

  // Grid color animation - keeps running after streaming completes (as long as there's content)
  useEffect(() => {
    if (THEMES[themeKey].renderMode !== 'grid' || !THEMES[themeKey].animateCellColors) return;
    
    // Check if there's any content to animate
    const hasContent = streamBuffersRef.current.some(buf => buf.length > 0);
    if (!hasContent && !isRunning) return;

    let animationFrameId: number;

    const updateColors = (time: number) => {
      const t = themeRef.current;

      for (let i = 0; i < gridCellCount; i++) {
        const state = stateRefs.current[i];
        const ref = textRefs.current[i];

        if (ref && !state.isRWKV && state.text.length > 0) {
          if (time - state.lastColorChange > state.colorCycleInterval) {
            state.colorIndex = (state.colorIndex + 1) % t.palette.length;
            state.lastColorChange = time;
            ref.style.color = t.palette[state.colorIndex];
          }
        }
      }

      animationFrameId = requestAnimationFrame(updateColors);
    };

    animationFrameId = requestAnimationFrame(updateColors);
    return () => cancelAnimationFrame(animationFrameId);
  }, [gridCellCount, themeKey, isRunning]);

  // Rain animation - 轮播展示所有并发响应
  useEffect(() => {
    if (!isRunning || THEMES[themeKey].renderMode !== 'rain') return;

    const canvas = rainCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    // 显示列数（由 displayColumns 设置决定，但不超过并发数）
    const displayCount = Math.min(rainSettings.displayColumns, concurrency);
    
    // 追踪哪些流索引正在显示，哪些还没展示过
    let nextStreamIndex = displayCount; // 下一个要展示的流索引
    let cycleCount = 0; // 循环次数（当所有响应都展示完后+1）
    
    // 初始化：前 displayCount 个流分配给各列
    const initialIndices = Array.from({ length: displayCount }, (_, i) => i);
    const columns = createRainColumnsForDisplay(w, h, rainSettings, initialIndices);

    let animId: number;
    let frameCount = 0;
    let lastFrameTime = performance.now();

    const animate = (time: number) => {
      const deltaTime = Math.min(40, time - lastFrameTime || 16.67);
      lastFrameTime = time;
      frameCount++;

      // Semi-transparent overlay creates trailing fade.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.014)';
      ctx.fillRect(0, 0, w, h);

      // Every 120 frames (~2 seconds), clean up very dim pixels to prevent permanent ghosting
      if (frameCount % 120 === 0) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 1] < 8) {
            data[i] = 0;
            data[i + 1] = 0;
            data[i + 2] = 0;
          }
        }
        ctx.putImageData(imageData, 0, 0);
      }

      for (const col of columns) {
        // 获取该列对应的流数据
        const streamText = streamBuffersRef.current[col.streamIndex] || '';
        if (streamText.length === 0) continue; // 等待该路 API 数据

        const driftWave = rainSettings.organicVariation
          ? Math.sin(time * col.driftRate + col.driftPhase)
          : 0;
        const spacingWave = rainSettings.organicVariation
          ? Math.cos(time * col.driftRate * 0.72 + col.driftPhase * 1.31)
          : 0;
        const effectiveFallSpeed = col.speed * (1 + driftWave * col.fallVariance);
        const effectiveGenerationSpeed = Math.max(
          0.35,
          rainSettings.generationSpeed * (1 + driftWave * col.generationVariance),
        );
        const effectiveLineSpacing = Math.max(
          0.35,
          rainSettings.lineSpacing * (1 + spacingWave * col.spacingVariance),
        );

        col.y += (effectiveFallSpeed * deltaTime) / 16.67;

        const glyphStep = Math.max(
          2,
          (col.fontSize * effectiveLineSpacing) / effectiveGenerationSpeed,
        );

        if (col.y - col.lastDrawY >= glyphStep) {
          col.lastDrawY = col.y;
          
          // 只有当有新字符可显示时才递增索引
          if (col.charIndex < streamText.length) {
            if (col.y > 0 && col.y < h + col.fontSize) {
              const char = streamText[col.charIndex];

              const headGreen = Math.min(255, col.greenValue + 60);
              const headRed = col.greenValue > 180 ? Math.floor((col.greenValue - 180) * 1.5) : 0;
              const glowRadius = Math.max(1, col.fontSize * 0.3);

              ctx.font = `${col.fontSize}px "Cascadia Code", "Cascadia Mono", "Noto Sans Mono", "Microsoft YaHei", sans-serif`;
              ctx.shadowColor = `rgb(0, ${col.greenValue}, 0)`;
              ctx.shadowBlur = glowRadius;
              ctx.fillStyle = `rgb(${headRed}, ${headGreen}, ${Math.floor(headGreen * 0.12)})`;
              ctx.fillText(char, col.x, col.y);
              ctx.shadowBlur = 0;
            }
            col.charIndex++;
          }
        }

        // 当水滴落到底部且当前响应已显示完
        if (col.y > h + 80 && col.charIndex >= streamText.length) {
          // 获取下一个要展示的流索引
          let newStreamIndex: number;
          if (nextStreamIndex < concurrency) {
            // 还有未展示过的响应
            newStreamIndex = nextStreamIndex;
            nextStreamIndex++;
          } else {
            // 所有响应都展示过了，循环从头开始
            cycleCount++;
            nextStreamIndex = 0;
            newStreamIndex = nextStreamIndex;
            nextStreamIndex++;
          }
          
          // 创建新列，指向新的流索引
          const newCol = createRainColumn(col.x, h, false, rainSettings, newStreamIndex);
          newCol.charIndex = 0; // 从头开始显示新响应
          Object.assign(col, newCol);
        } else if (col.y > h + 80) {
          // 水滴落到底部但当前响应还没显示完，继续显示
          const newCol = createRainColumn(col.x, h, false, rainSettings, col.streamIndex);
          newCol.charIndex = col.charIndex; // 继续从上次的位置
          Object.assign(col, newCol);
        }
      }

      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);

    const onResize = () => {
      const nw = canvas.clientWidth;
      const nh = canvas.clientHeight;
      if (nw === 0 || nh === 0) return;
      const ndpr = window.devicePixelRatio || 1;
      canvas.width = nw * ndpr;
      canvas.height = nh * ndpr;
      ctx.setTransform(ndpr, 0, 0, ndpr, 0, 0);
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, nw, nh);
      // 重新计算列位置，但保持当前的流索引映射
      const currentIndices = columns.map(c => c.streamIndex);
      const newColumns = createRainColumnsForDisplay(nw, nh, rainSettings, currentIndices);
      // 保留 charIndex
      newColumns.forEach((newCol, i) => {
        newCol.charIndex = columns[i]?.charIndex || 0;
      });
      columns.splice(0, columns.length, ...newColumns);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
    };
  }, [isRunning, themeKey, rainSettings, concurrency]);

  const updateRainSetting = useCallback(
    (key: keyof RainSettings, value: number) => {
      setRainSettings((current) => ({
        ...current,
        [key]: value,
      }));
    },
    [],
  );

  // Rain 模式下，显示列数（不超过并发数）
  const rainColumnCount = Math.min(rainSettings.displayColumns, concurrency);

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden"
      style={{
        fontFamily: theme.headerFont,
        backgroundColor: theme.bg,
        color: theme.primary,
      }}
    >
      <header
        className="relative flex items-center justify-between px-6 py-4 shrink-0"
        style={{
          zIndex: 50,
          backgroundColor: theme.bg,
          borderBottom: `1px solid ${theme.primary}30`,
          boxShadow: `0 4px 20px ${theme.primary}1a`,
          fontFamily: theme.headerFont,
        }}
      >
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <h1
              className="text-[18px] font-bold uppercase"
              style={{
                color: theme.primary,
                textShadow: `0 0 8px ${theme.primary}99`,
                letterSpacing: theme.headerLetterSpacing,
              }}
            >
              RWKV_CONCURRENCY.EXE
            </h1>
            <div
              className="flex items-center gap-2 mt-1"
              style={{ letterSpacing: theme.headerLetterSpacing }}
            >
              <span
                className="text-[12px] font-bold uppercase"
                style={{ color: theme.secondary }}
              >
                SYS.THREAD_COUNT =
              </span>
              <input
                type="number"
                value={concurrency}
                onChange={(e) => setConcurrency(Math.max(1, Math.min(MAX_CONCURRENCY, parseInt(e.target.value) || 1)))}
                disabled={isRunning}
                min={1}
                max={MAX_CONCURRENCY}
                className="w-16 px-2 py-0.5 text-[12px] font-bold outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                style={{
                  fontFamily: theme.headerFont,
                  backgroundColor: `${theme.primary}15`,
                  border: `1px solid ${theme.primary}40`,
                  color: theme.primary,
                  opacity: isRunning ? 0.5 : 1,
                  letterSpacing: theme.headerLetterSpacing,
                  MozAppearance: 'textfield',
                }}
              />
            </div>
          </div>
        </div>

        {/* Prompt Input - Center */}
        <div className="flex-1 mx-4 max-w-sm">
          <textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            disabled={isRunning}
            rows={2}
            className="w-full px-3 py-2 text-[11px] resize-none outline-none overflow-y-auto scrollbar-hide"
            style={{
              fontFamily: theme.gridFont,
              backgroundColor: `${theme.primary}0a`,
              border: `1px solid ${theme.primary}30`,
              color: theme.primary,
              opacity: isRunning ? 0.5 : 1,
            }}
            placeholder="Enter your prompt here..."
          />
        </div>

        <div className="flex items-center space-x-8">
          <div className="hidden md:flex items-center space-x-6 text-[13px] font-bold uppercase" style={{ letterSpacing: theme.headerLetterSpacing }}>
            {[
              { label: 'Hardware', value: resolvedHardwareLabel },
              { label: 'Throughput', value: throughput },
              { label: 'Memory', value: memoryUsage },
            ].map((m, idx) => (
              <React.Fragment key={m.label}>
                {idx > 0 && (
                  <div className="w-px h-6" style={{ backgroundColor: `${theme.primary}30` }} />
                )}
                <div className="flex flex-col items-end">
                  <span className="text-[10px] mb-0.5" style={{ color: theme.secondary }}>
                    {m.label}
                  </span>
                  <span style={{ color: theme.primary, textShadow: `0 0 5px ${theme.primary}66` }}>
                    {m.value}
                  </span>
                </div>
              </React.Fragment>
            ))}
          </div>

          {/* Theme Selector */}
          <div className="relative" ref={themeMenuRef}>
            <button
              onClick={() => setThemeMenuOpen(!themeMenuOpen)}
              className="flex items-center gap-2 px-3 py-1.5 text-[12px] font-bold uppercase transition-all duration-150 border min-w-[172px]"
              style={{
                borderColor: `${theme.primary}50`,
                color: theme.primary,
                backgroundColor: `${theme.primary}0d`,
                letterSpacing: theme.headerLetterSpacing,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = `${theme.primary}1a`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = `${theme.primary}0d`;
              }}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: theme.swatch, boxShadow: `0 0 6px ${theme.swatch}` }}
              />
              <span className="flex-1">{theme.label}</span>
              <span className="text-[10px] ml-0.5">{themeMenuOpen ? '▴' : '▾'}</span>
            </button>

            {themeMenuOpen && (
              <div
                className="absolute right-0 top-full mt-1 min-w-48 border"
                style={{
                  zIndex: 100,
                  backgroundColor: theme.bg,
                  borderColor: `${theme.primary}40`,
                  boxShadow: `0 8px 32px rgba(0,0,0,0.8), 0 0 1px ${theme.primary}40`,
                }}
              >
                {THEME_KEYS.map((key) => {
                  const t = THEMES[key];
                  const isActive = key === themeKey;
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        setThemeKey(key);
                        setThemeMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors duration-100"
                      style={{
                        fontFamily: t.headerFont,
                        color: isActive ? t.swatch : `${theme.primary}99`,
                        backgroundColor: isActive ? `${t.swatch}1a` : 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = `${theme.primary}0d`;
                          e.currentTarget.style.color = t.swatch;
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.color = `${theme.primary}99`;
                        }
                      }}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: t.swatch, boxShadow: `0 0 4px ${t.swatch}` }}
                      />
                      <div className="flex flex-col">
                        <span className="text-[12px] font-bold tracking-widest">{t.label}</span>
                        <span className="text-[9px] tracking-wider" style={{ opacity: 0.6 }}>{t.description}</span>
                      </div>
                      {isActive && <span className="ml-auto text-[10px]">●</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {isRainMode && (
            <div className="relative" ref={rainSettingsRef}>
              <button
                onClick={() => setRainSettingsOpen(!rainSettingsOpen)}
                className="flex items-center gap-2 px-3 py-1.5 text-[12px] font-bold uppercase transition-all duration-150 border w-[160px]"
                style={{
                  borderColor: `${theme.primary}50`,
                  color: theme.primary,
                  backgroundColor: rainSettingsOpen ? `${theme.primary}1a` : `${theme.primary}0d`,
                  letterSpacing: theme.headerLetterSpacing,
                  boxShadow: rainSettingsOpen ? `0 0 14px ${theme.primary}33` : 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = `${theme.primary}1a`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = rainSettingsOpen ? `${theme.primary}1a` : `${theme.primary}0d`;
                }}
              >
                <span className="flex-1">RAIN_SETTINGS</span>
                <span className="text-[10px]">{rainSettingsOpen ? '▴' : '▾'}</span>
              </button>

              {rainSettingsOpen && (
                <div
                  className="absolute right-0 top-full mt-1 w-80 border p-4"
                  style={{
                    zIndex: 100,
                    backgroundColor: `${theme.bg}f2`,
                    borderColor: `${theme.primary}40`,
                    boxShadow: `0 8px 32px rgba(0,0,0,0.8), 0 0 1px ${theme.primary}40`,
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <div
                        className="text-[12px] font-bold uppercase"
                        style={{ letterSpacing: theme.headerLetterSpacing, color: theme.primary }}
                      >
                        Digital Rain Config
                      </div>
                      <div className="text-[10px] mt-1" style={{ color: `${theme.primary}99` }}>
                        显示 {rainColumnCount} 列 / 共 {concurrency} 路并发
                      </div>
                    </div>
                    <button
                      onClick={() => setRainSettings(DEFAULT_RAIN_SETTINGS)}
                      className="px-2 py-1 text-[10px] font-bold uppercase border transition-colors duration-150"
                      style={{
                        borderColor: `${theme.primary}40`,
                        color: theme.primary,
                        letterSpacing: theme.headerLetterSpacing,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = `${theme.primary}14`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      Reset
                    </button>
                  </div>

                  <div
                    className="mb-4 flex items-center justify-between gap-4 border px-3 py-3"
                    style={{
                      borderColor: `${theme.primary}30`,
                      backgroundColor: `${theme.primary}08`,
                    }}
                  >
                    <div>
                      <div className="text-[12px] font-bold" style={{ color: theme.primary }}>
                        随机波动
                      </div>
                      <div className="text-[10px]" style={{ color: `${theme.primary}80` }}>
                        让每列的下落速度、生成节奏和字距轻微起伏
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        setRainSettings((current) => ({
                          ...current,
                          organicVariation: !current.organicVariation,
                        }))
                      }
                      className="min-w-16 px-3 py-1.5 text-[10px] font-bold uppercase border transition-colors duration-150"
                      style={{
                        borderColor: `${theme.primary}40`,
                        color: rainSettings.organicVariation ? theme.bg : theme.primary,
                        backgroundColor: rainSettings.organicVariation ? theme.primary : 'transparent',
                        letterSpacing: theme.headerLetterSpacing,
                        boxShadow: rainSettings.organicVariation ? `0 0 12px ${theme.primary}33` : 'none',
                      }}
                      onMouseEnter={(e) => {
                        if (!rainSettings.organicVariation) {
                          e.currentTarget.style.backgroundColor = `${theme.primary}14`;
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = rainSettings.organicVariation ? theme.primary : 'transparent';
                      }}
                    >
                      {rainSettings.organicVariation ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  {[
                    {
                      key: 'displayColumns' as const,
                      label: '显示列数',
                      hint: '同时显示的水滴列数，轮播展示所有响应',
                      min: 10,
                      max: 200,
                      step: 10,
                      value: `${rainColumnCount} 列`,
                    },
                    {
                      key: 'fallSpeed' as const,
                      label: '下落速度',
                      hint: '控制字符雨整体下降速度',
                      min: 0.4,
                      max: 3,
                      step: 0.1,
                      value: `${rainSettings.fallSpeed.toFixed(1)}x`,
                    },
                    {
                      key: 'generationSpeed' as const,
                      label: '文字生成速度',
                      hint: '控制新字符出现的频率',
                      min: 0.5,
                      max: 3,
                      step: 0.1,
                      value: `${rainSettings.generationSpeed.toFixed(1)}x`,
                    },
                    {
                      key: 'lineSpacing' as const,
                      label: '纵向间距',
                      hint: '控制同一列字符之间的上下距离',
                      min: 0.5,
                      max: 3,
                      step: 0.1,
                      value: `${rainSettings.lineSpacing.toFixed(1)}x`,
                    },
                  ].map((control) => (
                    <label key={control.key} className="block mb-4 last:mb-0">
                      <div className="flex items-center justify-between gap-4 mb-1.5">
                        <div>
                          <div className="text-[12px] font-bold" style={{ color: theme.primary }}>
                            {control.label}
                          </div>
                          <div className="text-[10px]" style={{ color: `${theme.primary}80` }}>
                            {control.hint}
                          </div>
                        </div>
                        <div
                          className="text-[10px] px-2 py-1 border min-w-16 text-center"
                          style={{
                            borderColor: `${theme.primary}30`,
                            color: theme.primary,
                            backgroundColor: `${theme.primary}0d`,
                          }}
                        >
                          {control.value}
                        </div>
                      </div>
                      <input
                        type="range"
                        min={control.min}
                        max={control.max}
                        step={control.step}
                        value={rainSettings[control.key]}
                        onChange={(e) => updateRainSetting(control.key, Number(e.target.value))}
                        className="w-full accent-green-500"
                        style={{ accentColor: theme.primary }}
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="relative" ref={apiSettingsRef}>
              <button
                onClick={() => setApiSettingsOpen(!apiSettingsOpen)}
                className="flex items-center gap-2 px-3 py-1.5 text-[12px] font-bold uppercase transition-all duration-150 border w-[160px]"
                style={{
                  borderColor: `${theme.primary}50`,
                  color: theme.primary,
                  backgroundColor: apiSettingsOpen ? `${theme.primary}1a` : `${theme.primary}0d`,
                  letterSpacing: theme.headerLetterSpacing,
                  boxShadow: apiSettingsOpen ? `0 0 14px ${theme.primary}33` : 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = `${theme.primary}1a`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = apiSettingsOpen ? `${theme.primary}1a` : `${theme.primary}0d`;
                }}
              >
                <span className="flex-1">API_SETTINGS</span>
                <span className="text-[10px]">{apiSettingsOpen ? '▴' : '▾'}</span>
              </button>

              {apiSettingsOpen && (
                <div
                  className="absolute right-0 top-full mt-1 w-80 border p-4"
                  style={{
                    zIndex: 100,
                    backgroundColor: `${theme.bg}f2`,
                    borderColor: `${theme.primary}40`,
                    boxShadow: `0 8px 32px rgba(0,0,0,0.8), 0 0 1px ${theme.primary}40`,
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <div
                        className="text-[12px] font-bold uppercase"
                        style={{ letterSpacing: theme.headerLetterSpacing, color: theme.primary }}
                      >
                        API Configuration
                      </div>
                      <div className="text-[10px] mt-1" style={{ color: `${theme.primary}99` }}>
                        调整请求参数
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (modelProbeAbortRef.current) {
                          modelProbeAbortRef.current.abort();
                          modelProbeAbortRef.current = null;
                        }
                        setMaxTokens(4096);
                        setCustomEndpoint('');
                        setApiKeyInput('');
                        setApiPasswordInput('');
                        setCustomHardwareName('');
                        setBackendHardwareName('');
                        setAvailableModels([]);
                        setModelSelectValue(AUTO_MODEL_OPTION);
                        setCustomModelName('');
                        setModelProbeStatus('idle');
                        setModelProbeMessage('');
                        setModelProbeSourceUrl('');
                      }}
                      className="px-2 py-1 text-[10px] font-bold uppercase border transition-colors duration-150"
                      style={{
                        borderColor: `${theme.primary}40`,
                        color: theme.primary,
                        letterSpacing: theme.headerLetterSpacing,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = `${theme.primary}14`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      Reset
                    </button>
                  </div>

                  <label className="block mb-4">
                    <div className="flex items-center justify-between gap-4 mb-1.5">
                      <div>
                        <div className="text-[12px] font-bold" style={{ color: theme.primary }}>
                          max_tokens
                        </div>
                        <div className="text-[10px]" style={{ color: `${theme.primary}80` }}>
                          控制生成的最大 token 数量
                        </div>
                      </div>
                      <div
                        className="text-[10px] px-2 py-1 border min-w-16 text-center"
                        style={{
                          borderColor: `${theme.primary}30`,
                          color: theme.primary,
                          backgroundColor: `${theme.primary}0d`,
                        }}
                      >
                        {maxTokens}
                      </div>
                    </div>
                    <input
                      type="range"
                      min={4096}
                      max={8192}
                      step={256}
                      value={maxTokens}
                      onChange={(e) => setMaxTokens(Number(e.target.value))}
                      className="w-full accent-green-500"
                      style={{ accentColor: theme.primary }}
                    />
                  </label>

                  <div>
                    <div className="flex items-center justify-between gap-4 mb-1.5">
                      <div>
                        <div className="text-[12px] font-bold" style={{ color: theme.primary }}>
                          API URL
                        </div>
                        <div className="text-[10px]" style={{ color: `${theme.primary}80` }}>
                          支持自动补全常见 endpoint
                        </div>
                      </div>
                      {customEndpoint && (
                        <div
                          className="text-[10px] px-2 py-1 border"
                          style={{
                            borderColor: `${theme.primary}30`,
                            color: theme.primary,
                            backgroundColor: `${theme.primary}0d`,
                          }}
                        >
                          CUSTOM
                        </div>
                      )}
                    </div>
                    <input
                      type="text"
                      value={customEndpoint}
                      onChange={(e) => setCustomEndpoint(e.target.value)}
                      placeholder="填写完整 API 地址，例如 https://example.com/v1/chat/completions"
                      className="w-full px-2 py-1.5 text-[11px] outline-none"
                      style={{
                        backgroundColor: `${theme.primary}0a`,
                        border: `1px solid ${theme.primary}30`,
                        color: theme.primary,
                      }}
                    />
                    <div className="mt-2 text-[10px] break-all" style={{ color: `${theme.primary}80` }}>
                      当前请求地址：{resolvedApiUrl}
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between gap-4 mb-1.5">
                      <div>
                        <div className="text-[12px] font-bold" style={{ color: theme.primary }}>
                          API key
                        </div>
                        <div className="text-[10px]" style={{ color: `${theme.primary}80` }}>
                          可选，用于需要鉴权的通用端点
                        </div>
                      </div>
                      {resolvedApiKey && (
                        <div
                          className="text-[10px] px-2 py-1 border"
                          style={{
                            borderColor: `${theme.primary}30`,
                            color: theme.primary,
                            backgroundColor: `${theme.primary}0d`,
                          }}
                        >
                          ENABLED
                        </div>
                      )}
                    </div>
                    <input
                      type="password"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder="留空则不发送 Authorization / x-api-key"
                      className="w-full px-2 py-1.5 text-[11px] outline-none"
                      style={{
                        backgroundColor: `${theme.primary}0a`,
                        border: `1px solid ${theme.primary}30`,
                        color: theme.primary,
                      }}
                    />
                    <div className="mt-1 text-[10px]" style={{ color: `${theme.primary}66` }}>
                      非空时会附带 `Authorization: Bearer ...`、`x-api-key`、`api-key`
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between gap-4 mb-1.5">
                      <div>
                        <div className="text-[12px] font-bold" style={{ color: theme.primary }}>
                          API password
                        </div>
                        <div className="text-[10px]" style={{ color: `${theme.primary}80` }}>
                          可选，用于需要在请求体中传 `password` 的端点
                        </div>
                      </div>
                      {resolvedApiPassword && (
                        <div
                          className="text-[10px] px-2 py-1 border"
                          style={{
                            borderColor: `${theme.primary}30`,
                            color: theme.primary,
                            backgroundColor: `${theme.primary}0d`,
                          }}
                        >
                          ENABLED
                        </div>
                      )}
                    </div>
                    <input
                      type="password"
                      value={apiPasswordInput}
                      onChange={(e) => setApiPasswordInput(e.target.value)}
                      placeholder="留空则不发送 password 字段"
                      className="w-full px-2 py-1.5 text-[11px] outline-none"
                      style={{
                        backgroundColor: `${theme.primary}0a`,
                        border: `1px solid ${theme.primary}30`,
                        color: theme.primary,
                      }}
                    />
                    <div className="mt-1 text-[10px]" style={{ color: `${theme.primary}66` }}>
                      非空时会在请求体中附带 `password`
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between gap-4 mb-1.5">
                      <div>
                        <div className="text-[12px] font-bold" style={{ color: theme.primary }}>
                          Hardware label
                        </div>
                        <div className="text-[10px]" style={{ color: `${theme.primary}80` }}>
                          留空时优先显示后端硬件名，否则显示 AUTO
                        </div>
                      </div>
                      <div
                        className="text-[10px] px-2 py-1 border"
                        style={{
                          borderColor: `${theme.primary}30`,
                          color: theme.primary,
                          backgroundColor: `${theme.primary}0d`,
                        }}
                      >
                        {customHardwareName.trim() ? 'MANUAL' : (backendHardwareName ? 'BACKEND' : 'AUTO')}
                      </div>
                    </div>
                    <input
                      type="text"
                      value={customHardwareName}
                      onChange={(e) => setCustomHardwareName(e.target.value)}
                      placeholder="可选：手动覆盖显示名称，例如 8x_H100_SXM"
                      className="w-full px-2 py-1.5 text-[11px] outline-none"
                      style={{
                        backgroundColor: `${theme.primary}0a`,
                        border: `1px solid ${theme.primary}30`,
                        color: theme.primary,
                      }}
                    />
                    <div className="mt-1 text-[10px] break-all" style={{ color: `${theme.primary}66` }}>
                      后端返回：{backendHardwareName || '未检测到'}
                    </div>
                    <div className="mt-1 text-[10px] break-all" style={{ color: `${theme.primary}66` }}>
                      当前显示：{resolvedHardwareLabel}
                    </div>
                  </div>

                  <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${theme.primary}18` }}>
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <div>
                        <div className="text-[12px] font-bold" style={{ color: theme.primary }}>
                          model
                        </div>
                        <div className="text-[10px]" style={{ color: `${theme.primary}80` }}>
                          自动检测可用模型，也可以手动指定
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          void probeAvailableModels(resolvedApiUrl, true);
                        }}
                        disabled={modelProbeStatus === 'probing'}
                        className="px-2 py-1 text-[10px] font-bold uppercase border transition-colors duration-150 disabled:opacity-60"
                        style={{
                          borderColor: `${theme.primary}40`,
                          color: theme.primary,
                          letterSpacing: theme.headerLetterSpacing,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = `${theme.primary}14`;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        {modelProbeStatus === 'probing' ? 'Scanning' : 'Refresh'}
                      </button>
                    </div>

                    <select
                      value={modelSelectValue}
                      onChange={(e) => setModelSelectValue(e.target.value)}
                      className="w-full px-2 py-1.5 text-[11px] outline-none"
                      style={{
                        backgroundColor: `${theme.primary}0a`,
                        border: `1px solid ${theme.primary}30`,
                        color: theme.primary,
                      }}
                    >
                      <option value={AUTO_MODEL_OPTION}>AUTO / 默认模型</option>
                      {selectableModels.map((modelName) => {
                        const isInjectedCurrent = modelName === modelSelectValue && !availableModels.includes(modelName);
                        return (
                          <option key={modelName} value={modelName}>
                            {isInjectedCurrent ? `${modelName} (当前)` : modelName}
                          </option>
                        );
                      })}
                      <option value={CUSTOM_MODEL_OPTION}>自定义模型…</option>
                    </select>

                    {modelSelectValue === CUSTOM_MODEL_OPTION && (
                      <input
                        type="text"
                        value={customModelName}
                        onChange={(e) => setCustomModelName(e.target.value)}
                        placeholder="输入 model 名称，例如 rwkv7-g1e-7.2b-20260301-ctx8192"
                        className="mt-2 w-full px-2 py-1.5 text-[11px] outline-none"
                        style={{
                          backgroundColor: `${theme.primary}0a`,
                          border: `1px solid ${theme.primary}30`,
                          color: theme.primary,
                        }}
                      />
                    )}

                    <div
                      className="mt-2 text-[10px] break-all"
                      style={{ color: modelProbeStatus === 'error' ? '#FF9F9F' : `${theme.primary}80` }}
                    >
                      {modelProbeStatus === 'probing'
                        ? '正在检测可用模型…'
                        : (modelProbeMessage || '输入 API 地址后会自动探测模型列表')}
                    </div>

                    {modelProbeSourceUrl && (
                      <div className="mt-1 text-[10px] break-all" style={{ color: `${theme.primary}66` }}>
                        模型列表来源：{modelProbeSourceUrl}
                      </div>
                    )}

                    <div className="mt-1 text-[10px] break-all" style={{ color: `${theme.primary}66` }}>
                      当前请求模型：{resolvedRequestModel || 'AUTO（不发送 model 字段）'}
                    </div>
                  </div>
                </div>
              )}
            </div>

          <button
            onClick={() => setIsRunning(!isRunning)}
            className="flex items-center justify-center px-3 py-1.5 text-[12px] font-bold uppercase transition-all duration-150 border w-[72px]"
            style={{
              letterSpacing: theme.headerLetterSpacing,
              borderColor: isRunning ? '#ffffff50' : `${theme.primary}50`,
              color: isRunning ? '#ffffff' : theme.primary,
              backgroundColor: isRunning ? '#ffffff0d' : `${theme.primary}0d`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = isRunning ? '#ffffff1a' : `${theme.primary}1a`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = isRunning ? '#ffffff0d' : `${theme.primary}0d`;
            }}
          >
            {isRunning ? 'STOP' : 'START'}
          </button>
        </div>
      </header>

      {connectionNotice && (
        <div
          className="px-6 py-2 text-[11px] border-b shrink-0"
          style={{
            backgroundColor: `${theme.primary}14`,
            borderColor: `${theme.primary}26`,
            color: theme.primary,
            fontFamily: theme.gridFont,
          }}
        >
          {connectionNotice}
        </div>
      )}

      {requestError && (
        <div
          className="px-6 py-2 text-[11px] border-b shrink-0"
          style={{
            backgroundColor: 'rgba(255, 64, 64, 0.10)',
            borderColor: 'rgba(255, 64, 64, 0.28)',
            color: '#FF9F9F',
            fontFamily: theme.gridFont,
          }}
        >
          API_ERROR: {requestError}
        </div>
      )}

      {/* Content area */}
      <div
        className="flex-1 w-full h-full relative"
        style={{
          backgroundColor: theme.bg,
          overflowX: 'hidden',
          overflowY: theme.renderMode === 'grid' && gridShouldScroll ? 'auto' : 'hidden',
        }}
      >
        {theme.renderMode === 'grid' ? (
          <>
            {theme.scanlineEnabled && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  zIndex: 20,
                  background: `linear-gradient(${theme.scanlineColor} 50%, rgba(0,0,0,0.1) 50%)`,
                  backgroundSize: `100% ${theme.scanlineSize}`,
                }}
              />
            )}

            {theme.vignette && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  zIndex: 21,
                  background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)',
                }}
              />
            )}

            {theme.noise && (
              <div
                className="absolute inset-0 pointer-events-none opacity-[0.03]"
                style={{
                  zIndex: 21,
                  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                  backgroundSize: '128px 128px',
                }}
              />
            )}

            <div
              className={theme.edgeToEdgeGrid ? 'w-full grid' : 'w-full grid p-px m-1 sm:m-2'}
              style={{
                minHeight: `${gridHeightPercent}%`,
                height: `${gridHeightPercent}%`,
                gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${gridRows}, minmax(0, 1fr))`,
                gap: theme.gridGap,
                backgroundColor: theme.gridBg,
                border: theme.gridBorder,
                padding: theme.edgeToEdgeGrid ? theme.gridInset : undefined,
                margin: theme.edgeToEdgeGrid ? theme.gridInset : undefined,
              }}
            >
              {Array.from({ length: gridCellCount }).map((_, i) => {
                const state = stateRefs.current[i];
                const isThreadActive = i < concurrency;
                const isSelected = selectedThreadIndex === i;
                return (
                  <button
                    type="button"
                    key={i}
                    disabled={!isThreadActive}
                    onClick={() => openThreadModal(i)}
                    title={isThreadActive ? `查看 ${formatThreadLabel(i)} 的完整输出` : `${formatThreadLabel(i)} 未启用`}
                    className="overflow-hidden relative flex flex-col text-left transition-all duration-150 disabled:cursor-default"
                    style={{
                      backgroundColor: theme.bg,
                      boxShadow: theme.cellGlow || 'none',
                      padding: theme.cellPadding,
                      justifyContent: theme.cellJustify,
                      borderStyle: 'solid',
                      borderWidth: isSelected ? '1px' : theme.showCellBorder ? '1px' : '0px',
                      borderColor: isSelected ? `${theme.primary}75` : (isThreadActive && theme.showCellBorder ? `${theme.primary}12` : 'transparent'),
                      cursor: isThreadActive ? 'pointer' : 'default',
                    }}
                    onMouseEnter={(event) => {
                      if (!isThreadActive || isSelected || !theme.cellHoverFeedback) return;
                      if (theme.showCellBorder) {
                        event.currentTarget.style.borderColor = `${theme.primary}55`;
                      }
                      event.currentTarget.style.backgroundColor = `${theme.primary}0d`;
                    }}
                    onMouseLeave={(event) => {
                      if (!isThreadActive || isSelected || !theme.cellHoverFeedback) return;
                      if (theme.showCellBorder) {
                        event.currentTarget.style.borderColor = `${theme.primary}12`;
                      }
                      event.currentTarget.style.backgroundColor = theme.bg;
                    }}
                  >
                    <div
                      ref={(el) => {
                        textRefs.current[i] = el;
                        if (el && !el.dataset.init) {
                          el.dataset.init = '1';
                          const t = themeRef.current;
                          el.style.fontFamily = t.gridFont;
                          el.style.fontSize = t.gridFontSize;
                          el.style.lineHeight = t.gridLineHeight;
                          el.style.letterSpacing = t.gridLetterSpacing;
                          el.style.wordSpacing = t.gridLetterSpacing;
                          el.style.filter = t.crtBlur ? 'blur(0.3px)' : 'none';
                          if (state.isRWKV && t !== THEMES.minimal) {
                            el.style.color = t.rwkvColor;
                            el.style.textShadow = t.rwkvGlow;
                            el.style.fontWeight = 'bold';
                          } else {
                            el.style.color = t.palette[getPaletteIndexForCell(i, t.palette.length, state.colorIndex)];
                            el.style.textShadow = t.glowStrength;
                            el.style.fontWeight = 'normal';
                          }
                        }
                      }}
                      className={theme.animateCellColors ? 'h-full overflow-hidden break-all transition-colors duration-500 ease-in-out' : 'h-full overflow-hidden break-all'}
                      style={{
                        wordBreak: 'break-all',
                        whiteSpace: 'pre-wrap',
                        opacity: state.isRWKV && highlightRWKVCells ? 1 : theme.cellOpacity,
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <canvas
            ref={rainCanvasRef}
            className="w-full h-full block"
            style={{ backgroundColor: '#000000' }}
          />
        )}

        {selectedThreadIndex !== null && (
          <div
            className="fixed inset-0 flex items-center justify-center p-4 sm:p-6"
            style={{
              zIndex: 120,
              backgroundColor: 'rgba(0, 0, 0, 0.82)',
              backdropFilter: 'blur(6px)',
            }}
            onClick={closeThreadModal}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`${selectedThreadLabel} 完整输出`}
              className="w-full max-w-5xl max-h-[min(88vh,960px)] overflow-hidden border flex flex-col"
              style={{
                backgroundColor: theme.bg,
                borderColor: `${theme.primary}55`,
                boxShadow: `0 24px 72px rgba(0,0,0,0.78), 0 0 24px ${theme.primary}22`,
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <div
                className="flex items-center justify-between gap-4 px-4 sm:px-6 py-4 border-b"
                style={{ borderColor: `${theme.primary}28` }}
              >
                <div className="min-w-0">
                  <div
                    className="text-[11px] sm:text-[12px] font-bold uppercase"
                    style={{
                      color: modalMutedTextColor,
                      letterSpacing: theme.headerLetterSpacing,
                      fontFamily: theme.headerFont,
                    }}
                  >
                    Thread Detail
                  </div>
                  <div
                    className="text-[18px] sm:text-[22px] font-bold uppercase truncate"
                    style={{
                      color: modalTextColor,
                      letterSpacing: theme.headerLetterSpacing,
                      fontFamily: theme.headerFont,
                      textShadow: 'none',
                    }}
                  >
                    {selectedThreadLabel}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div
                    className="hidden sm:flex flex-col items-end text-[10px] font-bold uppercase"
                    style={{
                      color: modalMutedTextColor,
                      letterSpacing: theme.headerLetterSpacing,
                      fontFamily: theme.headerFont,
                    }}
                  >
                    <span>Characters</span>
                    <span
                      className="text-[14px]"
                      style={{ color: modalTextColor, textShadow: 'none' }}
                    >
                      {selectedThreadText.length.toLocaleString()}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={closeThreadModal}
                    className="px-3 py-1.5 text-[12px] font-bold uppercase border transition-all duration-150"
                    style={{
                      color: modalTextColor,
                      borderColor: modalSoftBorderColor,
                      backgroundColor: modalSurfaceColor,
                      letterSpacing: theme.headerLetterSpacing,
                      fontFamily: theme.headerFont,
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="px-4 sm:px-6 py-3 border-b text-[11px] uppercase" style={{ borderColor: modalSoftBorderColor, color: modalMutedTextColor, fontFamily: theme.headerFont }}>
              </div>

              <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 scrollbar-hide">
                {selectedThreadText ? (
                  <div
                    className="thread-markdown"
                    style={{
                      color: modalTextColor,
                      fontFamily: theme.gridFont,
                      fontSize: '14px',
                      lineHeight: 2.5,
                      textShadow: 'none',
                      opacity: 0.96,
                      filter: 'none',
                    }}
                  >
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
                      rehypePlugins={[rehypeKatex]}
                      components={markdownComponents}
                    >
                      {selectedThreadText}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div
                    className="thread-markdown"
                    style={{
                      color: modalMutedTextColor,
                      fontFamily: theme.gridFont,
                      fontSize: '14px',
                      lineHeight: 2.5,
                      opacity: 0.72,
                    }}
                  >
                    {selectedThreadLabel} 暂无输出
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
