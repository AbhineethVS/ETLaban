import { DATA_KEY, clearCachedData, fetchApi, getSession, registerServiceWorker, rememberSignedIn } from "./auth.js";
import { getThemePreference, initTheme, revealPage, setThemePreference } from "./ui.js";

// Fetched live from ETLab by the backend, then cached on this device only.
const SOURCES = {
  attendance: "/api/attendance",
  results: "/api/results",
  materials: "/api/materials",
};
const SOURCE_LABELS = { attendance: "attendance", results: "results", materials: "materials" };
const STALE_AFTER_MS = 3 * 60 * 60 * 1000;

const VIEWS = {
  home: { title: "Home", icon: "home" },
  attendance: { title: "Attendance", icon: "calendar" },
  results: { title: "Results", icon: "results" },
  materials: { title: "Materials", icon: "book" },
  settings: { title: "Settings", icon: "sliders" },
};

// Old routes from the previous layout.
const LEGACY_ROUTES = {
  dashboard: { view: "home" },
  resources: { view: "materials", sub: "saved" },
};

const STORAGE = {
  resources: "better-etlab-resources",
  target: "better-etlab-target",
  attendanceTab: "better-etlab-attendance-tab",
  installDismissed: "better-etlab-install-dismissed",
  installAutoPrompted: "better-etlab-install-auto-prompted",
};

const TARGETS = [75, 80, 85];
const REPO_URL = "https://github.com/AbhineethVS/ETLaban";
const AUTHOR_URL = "https://github.com/AbhineethVS";
// KTU's model papers page only works when reached from this scheme list (it
// reads the scheme from session storage), so link here and spell out the steps.
const MODEL_PAPERS_URL = "https://ktu.edu.in/academics/scheme";
const GITHUB_MARK = '<svg class="github-mark" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';
const INSTALL_AUTO_DELAY_MS = 2 * 60 * 1000;

const ICONS = {
  home: '<path d="M4 10.2 12 4l8 6.2V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.5H9v5.5H5.5A1.5 1.5 0 0 1 4 19Z"/>',
  calendar: '<rect x="3.75" y="5" width="16.5" height="15.5" rx="3"/><path d="M3.75 10h16.5M8.5 3v4M15.5 3v4"/>',
  results: '<path d="M5.5 20v-6.5M12 20V5M18.5 20v-10"/>',
  book: '<path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v14.5H7.5A2.5 2.5 0 0 0 5 20Z"/><path d="M5 20a1.5 1.5 0 0 0 1.5 1.5H19"/>',
  sliders: '<path d="M4 7.5h9M17 7.5h3M4 16.5h3M11 16.5h9"/><circle cx="15" cy="7.5" r="2"/><circle cx="9" cy="16.5" r="2"/>',
  sync: '<path d="M19.5 12a7.5 7.5 0 0 1-13 5.1"/><path d="M4.5 12a7.5 7.5 0 0 1 13-5.1"/><path d="M17.5 3.5v3.5H14M6.5 20.5V17H10"/>',
  arrow: '<path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5"/>',
  external: '<path d="M8 16 16 8M9.5 8H16v6.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 1 0-5.66-5.66l-.9.9"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 1 0 5.66 5.66l.9-.9"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.9 12.2A1.5 1.5 0 0 0 8.9 20.5h6.2a1.5 1.5 0 0 0 1.5-1.3L17.5 7"/>',
  chevron: '<path d="m6.5 9.5 5.5 5.5 5.5-5.5"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/>',
  logout: '<path d="M14.5 4H18a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3.5"/><path d="M10 16.5 5.5 12 10 7.5M5.5 12H15"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5M12 16.2v.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};

const app = document.querySelector("#app");
const shell = document.querySelector(".shell");
const toastRegion = document.querySelector("#toast-region");
const installCard = document.querySelector("#install-card");

const state = {
  view: "home",
  sub: null,
  arg: null,
  data: {},
  session: null,
  syncing: false,
  savedAt: null,
  lastSyncError: null,
  selectedDay: null,
  expanded: new Set(),
  materialFilter: "all",
  materialQuery: "",
  deferredInstallPrompt: null,
  enterTimer: 0,
};

/* ---------------------------------------------------------------------------
   Small helpers
   ------------------------------------------------------------------------ */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function icon(name, size = 20) {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

// Only allow http(s) links into href attributes.
function safeUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value).trim(), window.location.href);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  } catch {
    // Storage full or blocked; nothing sensible to do.
  }
}

function plural(count, word, pluralWord = `${word}s`) {
  return `${count} ${count === 1 ? word : pluralWord}`;
}

const SMALL_WORDS = new Set(["a", "an", "and", "for", "in", "of", "on", "the", "to", "with"]);

function titleCase(text) {
  const raw = String(text || "").replace(/\s*-\s*(\d+)$/, " $1");
  // Mixed-case names from ETLab ("IT Workshop") are already right.
  if (/[a-z]/.test(raw)) return raw.trim();
  return raw
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      if (index > 0 && SMALL_WORDS.has(word)) return word;
      if (/^(i{1,3}|iv|v|vi{0,3})$/.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

// "GAMAT301 - MATHEMATICS FOR ..." -> { code, name }
function parseSubject(label) {
  const text = String(label || "").trim();
  const match = text.match(/^([A-Z0-9]{4,})\s*-\s*(.+)$/);
  if (!match) return { code: text, name: titleCase(text) };
  return { code: match[1], name: titleCase(match[2]) };
}

// Compact label for tight spaces: keep short names, cut before a joining
// word ("Mathematics for ..." -> "Mathematics"), or fall back to initials.
function shortName(name) {
  if (name.length <= 21) return name;
  const words = name.split(" ");
  const cut = words.findIndex((word, index) => index > 0 && SMALL_WORDS.has(word));
  if (cut > 0) {
    const head = words.slice(0, cut).join(" ");
    if (head.length >= 5) return head;
  }
  return words
    .filter((word) => !SMALL_WORDS.has(word))
    .map((word) => (/^\d+$/.test(word) ? word : word.charAt(0)))
    .join("")
    .toUpperCase();
}

function percentValue(value) {
  if (typeof value === "number") return value;
  const match = String(value || "").match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function parseFraction(value) {
  const match = String(value || "").match(/(\d+)\s*\/\s*(\d+)/);
  return match ? { present: Number(match[1]), total: Number(match[2]) } : null;
}

function parseIsoDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

function parseDmyDate(value) {
  const match = String(value || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match ? new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])) : null;
}

function isoDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const formatWeekday = new Intl.DateTimeFormat("en-IN", { weekday: "long" });
const formatWeekdayShort = new Intl.DateTimeFormat("en-IN", { weekday: "short" });
const formatDayMonth = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long" });
const formatDayMonthShort = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });
const formatMonth = new Intl.DateTimeFormat("en-IN", { month: "long" });
const formatTime = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });

function relativeTime(date) {
  if (!date) return "";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDayMonthShort.format(date);
}

function relativeDay(date) {
  if (!date) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today - date) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return `${days} days ago`;
  return formatDayMonthShort.format(date);
}

/* ---------------------------------------------------------------------------
   Data model
   ------------------------------------------------------------------------ */

function target() {
  const value = Number(localStorage.getItem(STORAGE.target));
  return TARGETS.includes(value) ? value : 75;
}

function attendanceInfo(present, total) {
  const t = target() / 100;
  const percent = total ? (present / total) * 100 : 100;
  const canMiss = total ? Math.max(0, Math.floor(present / t - total + 1e-9)) : 0;
  const need = percent < t * 100 ? Math.ceil((t * total - present) / (1 - t) - 1e-9) : 0;
  const tone = percent < t * 100 ? "risk" : percent < t * 100 + 5 ? "close" : "safe";
  return { present, total, percent, canMiss, need, tone };
}

// Round for display, but never show "75%" for something that is really 74.6%.
function formatPercent(percent) {
  const rounded = Math.round(percent);
  const t = target();
  if (percent < t && rounded >= t) return percent.toFixed(1);
  return String(rounded);
}

function subjectNames() {
  if (state.cache.names) return state.cache.names;
  const names = new Map();
  const add = (label) => {
    const { code, name } = parseSubject(label);
    if (code && name && name !== code && !names.has(code)) names.set(code, name);
  };
  (state.data.results?.universityResult || []).forEach((row) => add(row.subjectName));
  (state.data.attendanceDetails || []).forEach((day) => (day.periods || []).forEach((p) => add(p.subject)));
  (state.data.materials || []).forEach((m) => add(m.subject));
  Object.values(state.data.results?.assessmentResults || {}).forEach((section) =>
    (section.items || []).forEach((item) => add(item.subject)),
  );
  state.cache.names = names;
  return names;
}

function nameFor(code) {
  return subjectNames().get(code) || code;
}

function subjects() {
  if (state.cache.subjects) return state.cache.subjects;
  state.cache.subjects = (state.data.attendanceSubject?.subjects || []).map((subject) => {
    const present = Number(subject.attendance?.present) || 0;
    const total = Number(subject.attendance?.total) || 0;
    const name = nameFor(subject.code);
    return { code: subject.code, name, short: shortName(name), ...attendanceInfo(present, total) };
  });
  return state.cache.subjects;
}

function overall() {
  const summary = state.data.attendanceSubject?.summary;
  const fraction = parseFraction(summary?.total);
  if (fraction) return attendanceInfo(fraction.present, fraction.total);
  return totalsOf(subjects());
}

function totalsOf(list) {
  if (!list.length) return null;
  const present = list.reduce((sum, s) => sum + s.present, 0);
  const total = list.reduce((sum, s) => sum + s.total, 0);
  return attendanceInfo(present, total);
}

// Earlier semesters have no attendance report of their own here; their
// results page lists each course's attendance, so read it from there.
function semesterSubjects(semester) {
  return (semester.universityResult || [])
    .filter((course) => Number(course.attendance?.total) > 0)
    .map((course) => {
      const { code, name } = parseSubject(course.subjectName);
      const present = Number(course.attendance.present) || 0;
      const total = Number(course.attendance.total);
      return { code: course.subjectCode || code, name, short: shortName(name), ...attendanceInfo(present, total) };
    });
}

function semesterAttendance(semester) {
  return (semester.current && overall()) || totalsOf(semesterSubjects(semester));
}

function monthModel() {
  if (state.cache.month !== undefined) return state.cache.month;
  const month = state.data.attendanceMonth;
  if (!month?.days?.length) {
    state.cache.month = null;
    return null;
  }

  // Early in a month ETLab gives no dated links, so days can arrive without a
  // date. Place them in the month the other days use, or else this month.
  const anchor = month.days.map((day) => parseIsoDate(day.date)).find(Boolean) || new Date();
  const details = new Map((state.data.attendanceDetails || []).map((day) => [day.date, day.periods || []]));
  const days = month.days.map((day) => {
    const dateObj =
      parseIsoDate(day.date) || new Date(anchor.getFullYear(), anchor.getMonth(), Number(day.day) || 1);
    const date = isoDate(dateObj);
    const present = Number(day.attendance?.present) || 0;
    const total = Number(day.attendance?.total) || 0;
    const periods = (details.get(date) || [])
      .slice()
      .sort((a, b) => a.period - b.period)
      .map((p) => ({ period: p.period, status: p.status, ...parseSubject(p.subject) }));
    const marks = periods.length
      ? periods.map((p) => (p.status === "absent" ? "a" : "p"))
      : [...Array(present).fill("p"), ...Array(Math.max(0, total - present)).fill("a")];
    const kind = day.status === "attendance" && total > 0 ? "class" : day.status === "holiday" ? "holiday" : "none";
    return {
      date,
      day: day.day,
      dateObj,
      kind,
      present,
      total,
      periods,
      marks,
      missed: kind === "class" && present < total,
    };
  });

  const first = days[0].dateObj;
  const summary = month.summary || {};
  const fraction = parseFraction(summary.total);
  state.cache.month = {
    year: first.getFullYear(),
    monthIndex: first.getMonth(),
    days,
    classDays: days.filter((d) => d.kind === "class"),
    summaryText: fraction ? `${fraction.present} of ${fraction.total}` : "",
    monthPercent: summary.percentage || "",
  };
  return state.cache.month;
}

function missedBySubject() {
  const map = new Map();
  (monthModel()?.days || []).forEach((day) => {
    day.periods
      .filter((p) => p.status === "absent")
      .forEach((p) => {
        const list = map.get(p.code) || [];
        const existing = list.find((entry) => entry.date === day.date);
        if (existing) existing.periods.push(p.period);
        else list.push({ date: day.date, dateObj: day.dateObj, periods: [p.period] });
        map.set(p.code, list);
      });
  });
  return map;
}

function defaultSelectedDay() {
  const model = monthModel();
  if (!model) return null;
  const today = isoDate(new Date());
  const past = model.classDays.filter((d) => d.date <= today);
  return (past.at(-1) || model.classDays.at(-1) || model.days[0]).date;
}

function assessmentItems(semester = state.data.results) {
  const sections = semester?.assessmentResults || {};
  return Object.entries(sections)
    .filter(([, section]) => section.items?.length)
    .map(([key, section]) => ({
      key,
      label: section.label,
      items: section.items.map((item) => {
        const { code, name } = parseSubject(item.subject);
        const obtained = item.obtained ?? item.marksObtained ?? "";
        const max = Number(item.max ?? item.maximumMarks);
        const got = Number(obtained);
        const numeric = obtained !== "" && Number.isFinite(got) && max > 0;
        const raw = String(obtained).toLowerCase();
        const status = numeric ? "scored" : raw.includes("not submitted") ? "missing" : "pending";
        return {
          code,
          name,
          short: shortName(name),
          title: item.title || item.exam || item.assignment || section.label,
          max,
          got,
          status,
          percent: numeric ? (got / max) * 100 : null,
          url: safeUrl(item.viewResponseUrl),
        };
      }),
    }));
}

function materials() {
  if (state.cache.materials) return state.cache.materials;
  state.cache.materials = (state.data.materials || [])
    .map((m, index) => {
      const { code, name } = parseSubject(m.subject);
      const file = safeUrl(m.fileUrl);
      const link = safeUrl(m.linkUrl);
      const href = file || link;
      const kind = file
        ? (file.match(/\.([a-z0-9]{2,4})(?:$|\?)/i)?.[1] || "file").toLowerCase()
        : link
          ? /drive\.google|docs\.google/.test(link)
            ? "drive"
            : "link"
          : "none";
      return {
        index,
        code,
        name,
        short: shortName(name),
        title: m.title || "Untitled",
        module: String(m.module || "").replace(/\s*-\s*/, " "),
        details: m.details || "",
        date: parseDmyDate(m.created),
        file,
        link,
        href,
        kind,
      };
    })
    .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0) || a.index - b.index);
  return state.cache.materials;
}

function student() {
  return state.data.attendanceSubject?.student || state.data.attendanceMonth?.student || {};
}

function semesterLabel() {
  if (state.data.results?.currentSemester) return `Semester ${state.data.results.currentSemester}`;
  const raw =
    state.data.results?.assessmentResults?.sessionalExams?.items?.[0]?.semester ||
    state.data.materials?.[0]?.semester ||
    "";
  const roman = raw.match(/\b([IVX]+)(?:st|nd|rd|th)?\b/i)?.[1]?.toUpperCase();
  if (!roman) return "";
  const values = { I: 1, V: 5, X: 10 };
  let total = 0;
  for (let i = 0; i < roman.length; i++) {
    const value = values[roman[i]];
    const next = values[roman[i + 1]] || 0;
    total += value < next ? -value : value;
  }
  return total ? `Semester ${total}` : "";
}

function lastSynced() {
  return state.savedAt ? new Date(state.savedAt) : null;
}

function hasData() {
  return Boolean(
    state.data.attendanceSubject?.subjects?.length || state.data.materials?.length || state.data.results,
  );
}

function syncStatusText() {
  if (state.syncing) return "Syncing with ETLab…";
  const synced = lastSynced();
  return synced ? `Synced ${relativeTime(synced)}` : "Not synced yet";
}

/* ---------------------------------------------------------------------------
   Loading + sync
   ------------------------------------------------------------------------ */

function readCache() {
  const cached = readJson(DATA_KEY, null);
  return cached && typeof cached === "object" ? cached : {};
}

function applyData(cached) {
  state.data = {
    attendanceSubject: cached.attendance?.subject || null,
    attendanceMonth: cached.attendance?.month || null,
    attendanceDetails: cached.attendance?.dayDetails || [],
    results: cached.results || null,
    materials: cached.materials || [],
  };
  state.savedAt = cached.savedAt || null;
  state.cache = {};
  if (!state.selectedDay || !monthModel()?.days.some((d) => d.date === state.selectedDay)) {
    state.selectedDay = defaultSelectedDay();
  }
}

async function loadData() {
  applyData(readCache());
}

function isStale() {
  return !state.savedAt || Date.now() - state.savedAt > STALE_AFTER_MS;
}

function setSyncing(syncing) {
  state.syncing = syncing;
  document.documentElement.classList.toggle("is-syncing", syncing);
  document.querySelectorAll('[data-action="sync"]').forEach((button) => {
    button.disabled = syncing;
  });
  updateSyncStatus();
}

function updateSyncStatus() {
  const text = syncStatusText();
  document.querySelectorAll("[data-sync-status]").forEach((el) => {
    el.textContent = text;
  });
}

const SOURCE_TIMEOUT_MS = { attendance: 48000, results: 48000, materials: 48000 };

async function fetchSource(key) {
  let response;
  try {
    response = await fetchApi(
      SOURCES[key],
      { cache: "no-store", credentials: "same-origin" },
      { timeoutMs: SOURCE_TIMEOUT_MS[key] || 45000 },
    );
  } catch (error) {
    if (error?.name === "TimeoutError") {
      throw new Error(`${SOURCE_LABELS[key]} took too long. Try Sync again.`);
    }
    throw error;
  }
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) {
    const error = new Error(body.error || "Log in again");
    error.renewable = Boolean(body.renewable);
    error.expired = Boolean(body.expired);
    // A renewable 401 still has a valid ETLaban cookie; try /api/renew first.
    error.signedOut = !error.renewable;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(body.error || `Couldn't load ${SOURCE_LABELS[key]}`);
    error.upstreamUnavailable = response.status === 429 || response.status >= 500;
    throw error;
  }
  return body;
}

// "Keep me signed in": the server logs back in to ETLab with the password sealed in the cookie.
async function renewSession() {
  let response;
  try {
    response = await fetchApi(
      "/api/renew",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
      },
      { timeoutMs: 25000 },
    );
  } catch (error) {
    if (error?.name === "TimeoutError" || error instanceof TypeError) {
      const timeout = new Error("ETLab took too long to sign you back in. Tap Sync and try again.");
      timeout.upstreamUnavailable = true;
      throw timeout;
    }
    throw error;
  }
  if (response.ok) return;
  const body = await response.json().catch(() => ({}));
  const error = new Error(
    body.error ||
      (response.status === 504 || response.status === 502
        ? "ETLab is busy. Tap Sync and try again."
        : "Couldn't sign you back in to ETLab"),
  );
  error.signedOut = response.status === 401;
  error.expired = Boolean(body.expired);
  error.upstreamUnavailable = response.status === 429 || response.status >= 500;
  throw error;
}

async function runSync(options = {}) {
  if (state.syncing) return;
  setSyncing(true);
  state.lastSyncError = null;
  try {
    await syncSources(options);
  } catch (error) {
    console.error(error);
    state.lastSyncError = "Something went wrong while syncing. Try Sync again.";
    toast(state.lastSyncError, { icon: "alert", tone: "danger", duration: 6000 });
  } finally {
    // Never leave the app stuck on "Fetching…", whatever went wrong above.
    if (state.syncing) {
      setSyncing(false);
      render();
    }
  }
}

async function syncSources({ fromLogin = false, quiet = false } = {}) {
  if (!hasData()) render();

  // Do not hit ETLab with three requests at once. Results and materials are
  // cheaper, so load them before attendance's extra calendar requests.
  const keys = ["results", "materials", "attendance"];
  const settled = [];
  let renewed = false;

  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    try {
      let value;
      try {
        value = await fetchSource(key);
      } catch (error) {
        if (!error.renewable) throw error;
        if (renewed) {
          error.signedOut = true;
          throw error;
        }
        await renewSession();
        renewed = true;
        value = await fetchSource(key);
      }
      settled.push({ status: "fulfilled", value });
    } catch (error) {
      settled.push({ status: "rejected", reason: error });
      // One ETLab outage previously produced three simultaneous 502s. Stop
      // immediately; retrying the other sources only amplifies the outage.
      if (error.upstreamUnavailable || error.signedOut) {
        while (settled.length < keys.length) {
          settled.push({ status: "rejected", reason: error });
        }
        break;
      }
    }
  }

  const signedOut = settled.find((r) => r.status === "rejected" && r.reason?.signedOut);
  if (signedOut) {
    setSyncing(false);
    // A remembered cookie that still fails is kept by the server; drop it so /login doesn't bounce back here.
    if (signedOut.reason.renewable) await fetch("/api/logout", { method: "POST" }).catch(() => {});
    rememberSignedIn(false);
    window.location.replace(signedOut.reason.expired ? "/login?expired=1" : "/login");
    return;
  }

  const cached = readCache();
  const failed = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") cached[keys[index]] = result.value;
    else failed.push(keys[index]);
  });

  if (failed.length < keys.length) {
    cached.savedAt = Date.now();
    writeStorage(DATA_KEY, cached);
  }
  applyData(cached);
  setSyncing(false);
  render();

  if (!failed.length) {
    if (!quiet) toast(fromLogin ? "You're all set. Data is up to date." : "Synced with ETLab", { icon: "check" });
    return;
  }

  const reason = settled.find((r) => r.status === "rejected").reason;
  state.lastSyncError =
    reason instanceof TypeError
      ? "Can't reach ETLaban. Check your connection."
      : failed.length === keys.length
        ? reason.message
        : `Couldn't refresh ${failed.map((k) => SOURCE_LABELS[k]).join(" and ")}. ${reason.message}`;
  toast(state.lastSyncError, { icon: "alert", tone: "danger", duration: 6000 });
}

/* ---------------------------------------------------------------------------
   Shared pieces
   ------------------------------------------------------------------------ */

function pageHead(title, kicker = "", aside = "") {
  return `
    <header class="page-head">
      <div>
        ${kicker ? `<p class="kicker">${kicker}</p>` : ""}
        <h1 class="page-title display">${title}</h1>
      </div>
      ${aside}
    </header>
  `;
}

function meter(percent, tone, showTarget = true) {
  const value = Math.max(0, Math.min(percent ?? 0, 100)) / 100;
  return `
    <span class="meter" data-tone="${tone}" aria-hidden="true">
      <span class="meter-fill" style="--v: ${value.toFixed(3)}"></span>
      ${showTarget ? `<span class="meter-target" style="--t: ${target() / 100}"></span>` : ""}
    </span>
  `;
}

function dots(marks) {
  return marks.map((m) => `<i class="dot dot-${m}"></i>`).join("");
}

function segmented(options, value, action, label) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  return `
    <div class="segmented" role="radiogroup" aria-label="${escapeHtml(label)}" style="--n: ${options.length}; --i: ${index}">
      <span class="segmented-thumb" aria-hidden="true"></span>
      ${options
        .map(
          (o) => `
            <button type="button" role="radio" aria-checked="${o.value === value}" data-action="${action}" data-value="${escapeHtml(o.value)}">
              ${escapeHtml(o.label)}
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function updateSegmented(button) {
  const group = button.closest(".segmented");
  const buttons = [...group.querySelectorAll("button")];
  buttons.forEach((b) => b.setAttribute("aria-checked", String(b === button)));
  group.style.setProperty("--i", buttons.indexOf(button));
}

function blockHead(title, link, linkLabel) {
  return `
    <div class="block-head">
      <h2 class="block-title">${title}</h2>
      ${link ? `<a class="see-all" href="${link}">${linkLabel} ${icon("arrow", 15)}</a>` : ""}
    </div>
  `;
}

function emptyState({ title, text, action = true }) {
  return `
    <section class="empty">
      <h2 class="empty-title display">${title}</h2>
      <p class="empty-text">${text}</p>
      ${
        action
          ? `<button class="btn btn-primary" type="button" data-action="sync" ${state.syncing ? "disabled" : ""}>
              ${icon("sync", 18)} Sync with ETLab
            </button>`
          : ""
      }
    </section>
  `;
}

function firstSyncState() {
  return `
    <section class="first-sync">
      <div class="first-sync-mark" aria-hidden="true"><span></span><span></span><span></span></div>
      <h2 class="empty-title display">Fetching your <em>ETLab</em> data</h2>
      <p class="empty-text">Attendance, results and materials are on their way. The first sync can take a minute.</p>
      <div class="skeleton" aria-hidden="true"><span></span><span></span><span></span></div>
    </section>
  `;
}

/* ---------------------------------------------------------------------------
   Home
   ------------------------------------------------------------------------ */

function greeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 22) return "Good evening";
  return "Hello";
}

function firstName() {
  const name = titleCase(student().name || "").split(" ")[0];
  return name && name.length > 1 ? name : "";
}

function homeStatus(list) {
  const t = target();
  const risk = list.filter((s) => s.tone === "risk").sort((a, b) => a.percent - b.percent);
  if (risk.length) {
    const worst = risk[0];
    const more = risk.length > 1 ? ` ${plural(risk.length - 1, "other subject")} ${risk.length > 2 ? "are" : "is"} below too.` : "";
    return {
      tone: "risk",
      title: `${plural(risk.length, "subject")} below ${t}%`,
      text: `Attend the next <strong>${plural(worst.need, "class", "classes")}</strong> of ${escapeHtml(worst.short)} to get back to ${t}%.${more}`,
    };
  }
  if (!list.length) return { tone: "safe", title: "No attendance yet", text: "Sync to pull your attendance from ETLab." };
  const tightest = list.slice().sort((a, b) => a.canMiss - b.canMiss || a.percent - b.percent)[0];
  const close = list.some((s) => s.tone === "close");
  const spare =
    tightest.canMiss === 0
      ? `has <strong>no classes to spare</strong>`
      : `can miss <strong>${plural(tightest.canMiss, "more class", "more classes")}</strong>`;
  return {
    tone: close ? "close" : "safe",
    title: close ? "Close to the line" : "You're on track",
    text: `Every subject is above ${t}%. Tightest is ${escapeHtml(tightest.short)}, which ${spare}.`,
  };
}

function gauge(info, size = "lg") {
  const value = Math.min(info.percent, 100);
  return `
    <div class="gauge gauge-${size}" data-tone="${info.tone}">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle class="gauge-track" cx="60" cy="60" r="52" />
        <circle class="gauge-value" cx="60" cy="60" r="52" pathLength="100" style="--value: ${value.toFixed(2)}" />
      </svg>
      <div class="gauge-label">
        <span class="gauge-num" style="--target: ${Math.trunc(Number(formatPercent(value)))}" aria-hidden="true"></span>
        <span class="sr-only">${formatPercent(info.percent)} percent</span>
        <span class="gauge-caption">overall</span>
      </div>
    </div>
  `;
}

const ETLAB_NOTE = `<p class="muted-note etlab-note">All data here comes straight from ETLab. If something doesn't match, blame ETLab and curse them freely ;)<br />Pronounced as ET-Laban, like SignLaban :)</p>`;

function renderHome() {
  const name = firstName();
  const title = `${greeting()}${name ? `, <em>${escapeHtml(name)}.</em>` : "."}`;
  const kicker = [semesterLabel(), `<span data-sync-status>${escapeHtml(syncStatusText())}</span>`]
    .filter(Boolean)
    .join(" · ");

  if (!hasData()) {
    return `
      ${pageHead(title, kicker)}
      ${ETLAB_NOTE}
      ${
        state.syncing
          ? firstSyncState()
          : emptyState({
              title: "Nothing here <em>yet.</em>",
              text: state.lastSyncError
                ? `The last sync didn't finish: ${escapeHtml(state.lastSyncError)}`
                : "Pull your attendance, results and materials from ETLab. It takes about a minute.",
            })
      }
    `;
  }

  const list = subjects();
  const info = overall();
  const status = homeStatus(list);
  const month = monthModel();
  const watch = list
    .slice()
    .sort((a, b) => a.percent - b.percent)
    .slice(0, 3);
  const recent = (month?.classDays || []).filter((d) => d.date <= isoDate(new Date())).slice(-7);
  const scores = assessmentItems()
    .flatMap((section) => section.items)
    .filter((item) => item.status === "scored")
    .slice(0, 3);
  const newest = materials().slice(0, 3);

  return `
    ${pageHead(title, kicker)}
    ${ETLAB_NOTE}
    <div class="home-grid">
      <div class="home-col">
        ${
          info
            ? `<section class="card overview" data-tone="${status.tone}">
                ${gauge(info)}
                <div class="overview-body">
                  <p class="overview-status"><span class="status-dot"></span>${escapeHtml(status.title)}</p>
                  <p class="overview-text">${status.text}</p>
                  <dl class="overview-stats">
                    <div><dt>Attended</dt><dd>${info.present}<span>/${info.total}</span></dd></div>
                    ${month?.monthPercent ? `<div><dt>This month</dt><dd>${escapeHtml(month.monthPercent)}</dd></div>` : ""}
                    <div><dt>Missed</dt><dd>${info.total - info.present}</dd></div>
                  </dl>
                </div>
              </section>`
            : ""
        }

        ${
          watch.length
            ? `<section class="block">
                ${blockHead("Subjects to watch", "#attendance/subjects", "All subjects")}
                <ul class="list card">${watch.map((s) => subjectRow(s, { compact: true })).join("")}</ul>
              </section>`
            : ""
        }

        ${
          recent.length
            ? `<section class="block">
                ${blockHead("Recent days", "#attendance/calendar", "Calendar")}
                <div class="strip card">
                  ${recent
                    .map(
                      (d) => `
                        <a class="strip-day" href="#attendance/calendar/${d.date}" ${d.missed ? "data-missed" : ""}
                          aria-label="${formatWeekday.format(d.dateObj)} ${formatDayMonth.format(d.dateObj)}: ${d.present} of ${d.total} present">
                          <span class="strip-weekday">${formatWeekdayShort.format(d.dateObj).charAt(0)}</span>
                          <span class="strip-num">${d.day}</span>
                          <span class="dots">${dots(d.marks)}</span>
                        </a>
                      `,
                    )
                    .join("")}
                </div>
              </section>`
            : ""
        }
      </div>

      <div class="home-col">
        ${
          scores.length
            ? `<section class="block">
                ${blockHead("Latest marks", "#results", "Results")}
                <ul class="list card">${scores.map((item) => scoreRow(item)).join("")}</ul>
              </section>`
            : ""
        }
        ${
          newest.length
            ? `<section class="block">
                ${blockHead("New materials", "#materials", "Materials")}
                <ul class="list card">${newest.map((m) => materialRow(m)).join("")}</ul>
              </section>`
            : ""
        }
      </div>
    </div>
  `;
}

/* ---------------------------------------------------------------------------
   Attendance
   ------------------------------------------------------------------------ */

function subjectNote(s) {
  if (s.tone === "risk") return `Attend ${s.need} more`;
  if (s.canMiss === 0) return "No classes to spare";
  return `Can miss ${s.canMiss}`;
}

// `finished` rows belong to an earlier semester: no advice, nothing to expand.
function subjectRow(s, { compact = false, finished = false } = {}) {
  const note = finished ? "" : ` · <span class="subject-note">${subjectNote(s)}</span>`;
  const inner = `
    <span class="subject-text">
      <span class="subject-name">${escapeHtml(compact ? s.short : s.name)}</span>
      <span class="subject-meta">${compact ? "" : `<span class="mono">${escapeHtml(s.code)}</span> · `}${s.present} of ${s.total}${note}</span>
    </span>
    <span class="subject-pct">${formatPercent(s.percent)}<small>%</small></span>
    ${meter(s.percent, s.tone)}
  `;

  if (finished) {
    return `<li class="subject" data-tone="${s.tone}"><div class="subject-head">${inner}</div></li>`;
  }

  if (compact) {
    return `<li class="subject" data-tone="${s.tone}"><a class="subject-head" href="#attendance/subjects/${escapeHtml(s.code)}">${inner}</a></li>`;
  }

  const open = state.expanded.has(s.code);
  return `
    <li class="subject" data-tone="${s.tone}" data-open="${open}" data-code="${escapeHtml(s.code)}">
      <button class="subject-head" type="button" data-action="toggle-subject" aria-expanded="${open}">
        ${inner}
        <span class="subject-chevron">${icon("chevron", 18)}</span>
      </button>
      <div class="subject-more"><div class="subject-more-inner">${subjectDetails(s)}</div></div>
    </li>
  `;
}

function subjectDetails(s) {
  const missNext = (s.present / (s.total + 1)) * 100;
  const attendNext = ((s.present + 1) / (s.total + 1)) * 100;
  const missed = missedBySubject().get(s.code) || [];
  return `
    <dl class="detail-stats">
      <div><dt>Absent</dt><dd>${s.total - s.present}</dd></div>
      <div><dt>Miss next</dt><dd>${formatPercent(missNext)}%</dd></div>
      <div><dt>Attend next</dt><dd>${formatPercent(attendNext)}%</dd></div>
    </dl>
    ${
      missed.length
        ? `<p class="detail-label">Missed this month</p>
           <div class="missed">${missed
             .map(
               (m) => `
                 <a class="missed-day" href="#attendance/calendar/${m.date}">
                   ${formatDayMonthShort.format(m.dateObj)}
                   <span>P${m.periods.join(", ")}</span>
                 </a>
               `,
             )
             .join("")}</div>`
        : `<p class="detail-label">No absences this month.</p>`
    }
  `;
}

function attendanceTab() {
  if (state.sub === "subjects" || state.sub === "calendar") return state.sub;
  return localStorage.getItem(STORAGE.attendanceTab) === "calendar" ? "calendar" : "subjects";
}

function attendanceMeasure(semester) {
  const info = semesterAttendance(semester);
  if (!info) return {};
  const text = `${formatPercent(info.percent)}%`;
  return { value: info.percent / 100, text, detail: `${text} attendance`, tone: info.tone };
}

// `#attendance/semester/2` shows an earlier semester; anything else is the current one.
function selectedAttendanceSemester() {
  const list = semesters();
  const wanted = state.sub === "semester" ? Number(state.arg) : null;
  return list.find((s) => s.number === wanted) || list.find((s) => s.current) || null;
}

function renderAttendance() {
  const list = subjects();
  const info = overall();
  const month = monthModel();
  const kicker = [semesterLabel(), `Target ${target()}%`].filter(Boolean).join(" · ");

  if (!list.length && !month) {
    return `${pageHead("Attendance", kicker)}${state.syncing ? firstSyncState() : emptyState({ title: "No attendance <em>yet.</em>", text: "Sync with ETLab to see your subjects and calendar." })}`;
  }

  const summary = info
    ? `<div class="att-summary" data-tone="${info.tone}">
        <span class="att-big">${formatPercent(info.percent)}<small>%</small></span>
        <span class="att-sub">${info.present} of ${info.total}<br />classes</span>
      </div>`
    : "";
  const semesterList = semesters();
  const chart = semesterList.length
    ? semesterChart(semesterList, selectedAttendanceSemester(), {
        title: "Attendance by semester",
        meta: `Target ${target()}%`,
        action: "att-semester",
        measure: attendanceMeasure,
        targetLine: target() / 100,
      })
    : "";

  return `
    ${pageHead("Attendance", kicker, summary)}
    ${chart}
    <div id="att-sem" class="panel">${attendanceBody()}</div>
  `;
}

function attendanceBody() {
  const semester = selectedAttendanceSemester();
  return semester && !semester.current ? pastAttendance(semester) : currentAttendance();
}

function currentAttendance() {
  const tab = attendanceTab();
  return `
    <div class="toolbar">
      ${segmented(
        [
          { value: "subjects", label: "Subjects" },
          { value: "calendar", label: "Calendar" },
        ],
        tab,
        "att-tab",
        "Attendance view",
      )}
    </div>
    <div id="att-body" class="panel">${tab === "calendar" ? renderCalendar() : renderSubjectList()}</div>
  `;
}

function pastAttendance(semester) {
  const title = `<h2 class="sem-title display">Semester ${semester.number}</h2>`;
  const list = semesterSubjects(semester).sort((a, b) => a.percent - b.percent);
  const info = totalsOf(list);
  if (!info) return `${title}<p class="muted-note">ETLab has no attendance for this semester.</p>`;

  const below = list.filter((s) => s.tone === "risk").length;
  return `
    ${title}
    <dl class="card sem-summary">
      <div><dt>Attendance</dt><dd data-tone="${info.tone}">${formatPercent(info.percent)}<span>%</span></dd></div>
      <div><dt>Classes</dt><dd>${info.present}<span>/${info.total}</span></dd></div>
      <div><dt>Below ${target()}%</dt><dd ${below ? 'data-tone="risk"' : ""}>${below}</dd></div>
    </dl>
    <section class="block">
      ${blockHead(`Subjects <span class="count">${list.length}</span>`)}
      <ul class="list card subjects">${list.map((s) => subjectRow(s, { finished: true })).join("")}</ul>
      <p class="muted-note">From your semester ${semester.number} results on ETLab.</p>
    </section>
  `;
}

function renderSubjectList() {
  const list = subjects()
    .slice()
    .sort((a, b) => a.percent - b.percent);
  if (!list.length) return `<p class="muted-note">Subject totals aren't available yet.</p>`;
  return `<ul class="list card subjects">${list.map((s) => subjectRow(s)).join("")}</ul>`;
}

function renderCalendar() {
  const model = monthModel();
  if (!model) return `<p class="muted-note">The month calendar isn't available yet.</p>`;

  const firstWeekday = (new Date(model.year, model.monthIndex, 1).getDay() + 6) % 7; // Monday first
  const today = isoDate(new Date());
  const blanks = Array.from({ length: firstWeekday }, () => `<span class="cal-cell" aria-hidden="true"></span>`);
  const cells = model.days.map((d) => {
    const label = `${formatWeekday.format(d.dateObj)} ${formatDayMonth.format(d.dateObj)}${
      d.kind === "class" ? `, ${d.present} of ${d.total} present` : d.kind === "holiday" ? ", holiday" : ", no classes"
    }`;
    return `
      <button class="cal-cell cal-day" type="button" data-action="select-day" data-date="${d.date}" data-kind="${d.kind}"
        ${d.missed ? "data-missed" : ""} ${d.date === today ? 'aria-current="date"' : ""}
        aria-pressed="${d.date === state.selectedDay}" aria-label="${label}">
        <span class="cal-num">${d.day}</span>
        <span class="dots">${d.kind === "holiday" ? '<i class="dot dot-h"></i>' : dots(d.marks)}</span>
      </button>
    `;
  });

  return `
    <div class="calendar-layout">
      <section class="card calendar">
        <div class="cal-head">
          <h2 class="cal-title">${formatMonth.format(new Date(model.year, model.monthIndex, 1))} <span>${model.year}</span></h2>
          ${model.summaryText ? `<p class="cal-meta">${model.summaryText} · <strong>${escapeHtml(model.monthPercent)}</strong></p>` : ""}
        </div>
        <div class="cal-week" aria-hidden="true">${["M", "T", "W", "T", "F", "S", "S"].map((w) => `<span>${w}</span>`).join("")}</div>
        <div class="cal-grid">${blanks.join("")}${cells.join("")}</div>
        <div class="cal-legend" aria-hidden="true">
          <span><i class="dot dot-p"></i>Present</span>
          <span><i class="dot dot-a"></i>Absent</span>
          <span><i class="dot dot-h"></i>Holiday</span>
        </div>
      </section>
      <section id="day-panel" class="card day-panel" aria-live="polite">${dayPanel()}</section>
    </div>
  `;
}

function dayPanel() {
  const day = monthModel()?.days.find((d) => d.date === state.selectedDay);
  if (!day) return `<p class="muted-note">Pick a day to see each period.</p>`;

  const head = `
    <p class="kicker">${formatWeekday.format(day.dateObj)}</p>
    <h3 class="day-title display">${formatDayMonth.format(day.dateObj)}</h3>
  `;

  if (day.kind === "holiday") return `${head}<p class="day-summary">Holiday. No classes.</p>`;
  if (day.kind === "none") return `${head}<p class="day-summary">No classes recorded.</p>`;

  return `
    ${head}
    <p class="day-summary">
      ${day.present} of ${day.total} present${day.missed ? ` · <span class="day-missed">missed ${day.total - day.present}</span>` : ""}
    </p>
    ${
      day.periods.length
        ? `<ol class="periods">${day.periods
            .map(
              (p) => `
                <li class="period" data-status="${p.status}">
                  <span class="period-no">P${p.period}</span>
                  <span class="period-name">${escapeHtml(nameFor(p.code) || p.name)}</span>
                  <span class="period-status">${p.status === "absent" ? "Absent" : "Present"}</span>
                </li>
              `,
            )
            .join("")}</ol>`
        : `<p class="muted-note">Period details aren't available for this day.</p>`
    }
  `;
}

/* ---------------------------------------------------------------------------
   Results
   ------------------------------------------------------------------------ */

function scoreRow(item) {
  const value =
    item.status === "scored"
      ? `<span class="score-value">${item.got}<small>/${item.max}</small></span>`
      : `<span class="score-state" data-status="${item.status}">${item.status === "missing" ? "Not submitted" : "Pending"}</span>`;
  const tone = item.percent === null ? "none" : item.percent < 40 ? "risk" : item.percent < 60 ? "close" : "safe";
  const body = `
    <span class="score-text">
      <span class="score-name">${escapeHtml(item.short)}</span>
      <span class="score-meta">${escapeHtml(item.title)}${item.max && item.status !== "scored" ? ` · out of ${item.max}` : ""}</span>
    </span>
    ${value}
    ${item.status === "scored" ? meter(item.percent, tone, false) : ""}
  `;
  return item.url
    ? `<li class="score" data-tone="${tone}"><a class="score-head" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer" title="Open on ETLab">${body}</a></li>`
    : `<li class="score" data-tone="${tone}"><div class="score-head">${body}</div></li>`;
}

function semesters() {
  const results = state.data.results;
  if (!results) return [];
  if (results.semesters?.length) return results.semesters;
  // Older results.json without per-semester data: treat it as the current one.
  const number = Number(semesterLabel().match(/\d+/)?.[0]) || 1;
  return [
    {
      number,
      current: true,
      assessmentResults: results.assessmentResults,
      universityResult: results.universityResult,
      summary: {},
    },
  ];
}

function selectedSemester() {
  const list = semesters();
  const wanted = Number(state.sub);
  return list.find((s) => s.number === wanted) || list.find((s) => s.current) || list.at(-1);
}

function semesterCount(list) {
  return Math.max(state.data.results?.semesterCount || 8, ...list.map((s) => s.number));
}

// A value per semester as a small column chart that doubles as the semester
// picker. `measure(semester)` gives { value (0-1), text, detail, tone }; a
// semester without a value gets a stub instead of a bar.
function semesterChart(list, selected, { title, meta, action, measure, targetLine = null }) {
  const count = semesterCount(list);
  const byNumber = new Map(list.map((s) => [s.number, s]));
  const columns = Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    const semester = byNumber.get(number);
    const m = semester ? measure(semester) : {};
    const hasValue = Number.isFinite(m.value);
    const kind = !semester ? "upcoming" : semester.current ? "current" : "done";
    const detail = !semester ? "not started" : m.detail || (semester.current ? "in progress" : "");
    return `
      <button class="sem-col" type="button" role="radio" data-action="${action}" data-value="${number}" data-state="${kind}"
        ${m.tone ? `data-tone="${m.tone}"` : ""} aria-checked="${semester === selected}"
        aria-label="Semester ${number}${detail ? `, ${detail}` : ""}" ${semester ? "" : "disabled"}
        style="--h: ${hasValue ? Math.max(0, Math.min(m.value, 1)).toFixed(3) : 0}">
        <span class="sem-track">
          <span class="sem-value">${hasValue ? m.text : semester?.current ? "Now" : ""}</span>
          ${hasValue ? '<span class="sem-fill"></span>' : '<span class="sem-stub"></span>'}
        </span>
        <span class="sem-label">S${number}</span>
      </button>
    `;
  });

  const hasLine = targetLine !== null;
  const style = `--count: ${count}${hasLine ? `; --t: ${targetLine.toFixed(3)}` : ""}`;
  return `
    <section class="card sem-chart">
      <div class="sem-chart-head">
        <h2 class="block-title">${title}</h2>
        <p class="cal-meta">${meta}</p>
      </div>
      <div class="sem-cols" role="radiogroup" aria-label="Semester" style="${style}" ${hasLine ? "data-target" : ""}>${columns.join("")}</div>
    </section>
  `;
}

function sgpaMeasure(semester) {
  const sgpa = Number(semester.summary?.sgpa);
  if (!Number.isFinite(sgpa) || sgpa <= 0) return {};
  return { value: sgpa / 10, text: sgpa.toFixed(2), detail: `SGPA ${sgpa.toFixed(2)}` };
}

function courseRow(course, semester) {
  const { code, name } = parseSubject(course.subjectName);
  const grade = course.grade && course.grade !== "-" ? course.grade : "";
  const failed = course.result === "failed";
  const credits = Number(course.totalCredits) || 0;
  const internal =
    course.internalMarks && course.internalMarks !== "-" ? ` · internal ${escapeHtml(course.internalMarks)}` : "";
  const attempts = course.attempts || [];
  const history =
    new Set(attempts.map((a) => a.grade)).size > 1
      ? `<span class="course-history">${attempts.map((a) => `${escapeHtml(a.exam)}: ${escapeHtml(a.grade)}`).join(" · ")}</span>`
      : "";
  const shown = grade || (failed && !semester.current ? "F" : "–");
  return `
    <li class="course" ${failed ? 'data-tone="risk"' : ""}>
      <span class="course-text">
        <span class="course-name">${escapeHtml(name)}</span>
        <span class="course-meta"><span class="mono">${escapeHtml(course.subjectCode || code)}</span> · ${plural(credits, "credit")}${internal}${failed ? ` · <span class="course-flag">Not passed</span>` : ""}</span>
        ${history}
      </span>
      <span class="course-grade" ${grade || failed ? "" : "data-empty"}>${escapeHtml(shown)}</span>
    </li>
  `;
}

function semesterSummary(semester) {
  const summary = semester.summary || {};
  const courses = semester.universityResult || [];
  const credits = courses.reduce((sum, c) => sum + (Number(c.totalCredits) || 0), 0);
  const scored = assessmentItems(semester)
    .flatMap((section) => section.items)
    .filter((item) => item.status === "scored");
  const average = scored.length ? scored.reduce((sum, item) => sum + item.percent, 0) / scored.length : null;

  if (semester.current) {
    return `
      <dl class="card sem-summary">
        <div><dt>Status</dt><dd class="sem-status">In progress</dd></div>
        <div><dt>Test average</dt><dd>${average === null ? "–" : `${Math.round(average)}<span>%</span>`}</dd></div>
        <div><dt>Credits</dt><dd>${credits || "–"}</dd></div>
      </dl>
    `;
  }

  const failed = summary.status === "failed";
  const sgpa = Number(summary.sgpa);
  return `
    <dl class="card sem-summary">
      <div><dt>SGPA</dt><dd>${Number.isFinite(sgpa) && sgpa > 0 ? sgpa.toFixed(2) : "–"}</dd></div>
      <div><dt>Credits</dt><dd>${escapeHtml(summary.earnedCredits ?? "–")}<span>/${escapeHtml(summary.totalCredits ?? credits)}</span></dd></div>
      <div><dt>Result</dt><dd class="sem-status" ${failed ? 'data-tone="risk"' : ""}>${failed ? "Backlog" : summary.status === "passed" ? "Passed" : "–"}</dd></div>
    </dl>
  `;
}

function semesterBody(semester) {
  const sections = assessmentItems(semester);
  const courses = semester.universityResult || [];
  const graded = courses.some((c) => c.grade && c.grade !== "-");

  const coursesBlock = courses.length
    ? `<section class="block">
        ${blockHead(`${graded ? "Grades" : "Courses"} <span class="count">${courses.length}</span>`)}
        <ul class="list card">${courses.map((c) => courseRow(c, semester)).join("")}</ul>
        ${graded ? "" : `<p class="muted-note">Grades show up here once the university publishes them.</p>`}
      </section>`
    : "";

  const assessmentBlocks = sections.length
    ? sections
        .map(
          (section) => `
            <section class="block">
              ${blockHead(`${escapeHtml(section.label)} <span class="count">${section.items.length}</span>`)}
              <ul class="list card">${section.items.map((item) => scoreRow(item)).join("")}</ul>
            </section>
          `,
        )
        .join("")
    : `<p class="muted-note">No internal marks were published for this semester.</p>`;

  // Finished semesters lead with grades; the current one leads with marks.
  const [first, second] = semester.current ? [assessmentBlocks, coursesBlock] : [coursesBlock, assessmentBlocks];
  return `
    <h2 class="sem-title display">Semester ${semester.number}${semester.current ? " <em>now</em>" : ""}</h2>
    ${semesterSummary(semester)}
    <div class="results-grid">
      <div class="results-col">${first}</div>
      <div class="results-col">${second}</div>
    </div>
  `;
}

function renderResults() {
  const results = state.data.results;
  if (!results) {
    return `${pageHead("Results", semesterLabel())}${state.syncing ? firstSyncState() : emptyState({ title: "No results <em>yet.</em>", text: "Sync with ETLab to see your marks." })}`;
  }

  const list = semesters();
  const selected = selectedSemester();
  const current = list.find((s) => s.current)?.number;
  const cgpa = Number(results.cgpa);
  const aside =
    Number.isFinite(cgpa) && cgpa > 0
      ? `<div class="att-summary"><span class="att-big">${cgpa.toFixed(2)}</span><span class="att-sub">CGPA<br />so far</span></div>`
      : "";

  return `
    ${pageHead("Results", current ? `Semester ${current} of ${semesterCount(list)}` : "", aside)}
    ${semesterChart(list, selected, { title: "SGPA by semester", meta: "Out of 10", action: "semester", measure: sgpaMeasure })}
    <div id="sem-body" class="panel sem-body">${semesterBody(selected)}</div>
  `;
}

/* ---------------------------------------------------------------------------
   Materials + saved links
   ------------------------------------------------------------------------ */

function kindLabel(kind) {
  if (kind === "drive") return "Drive";
  if (kind === "link") return icon("link", 16);
  if (kind === "none") return "—";
  return escapeHtml(kind.toUpperCase().slice(0, 4));
}

function materialRow(m) {
  const meta = [m.short, m.module, m.date ? relativeDay(m.date) : ""].filter(Boolean).map(escapeHtml).join(" · ");
  const body = `
    <span class="file-tile" data-kind="${m.kind}">${kindLabel(m.kind)}</span>
    <span class="mat-text">
      <span class="mat-title">${escapeHtml(m.title)}</span>
      <span class="mat-meta">${meta}</span>
      ${m.details ? `<span class="mat-details">${escapeHtml(m.details)}</span>` : ""}
    </span>
    ${m.href ? `<span class="row-go">${icon("external", 18)}</span>` : ""}
  `;
  const search = `${m.title} ${m.name} ${m.code} ${m.module} ${m.details}`.toLowerCase();
  return `
    <li class="mat" data-code="${escapeHtml(m.code)}" data-search="${escapeHtml(search)}">
      ${m.href ? `<a class="mat-head" href="${escapeHtml(m.href)}" target="_blank" rel="noreferrer">${body}</a>` : `<div class="mat-head">${body}</div>`}
      ${
        m.file && m.link
          ? `<a class="icon-btn mat-extra" href="${escapeHtml(m.link)}" target="_blank" rel="noreferrer" aria-label="Open the attached link">${icon("link", 18)}</a>`
          : ""
      }
    </li>
  `;
}

function materialsTab() {
  if (state.sub === "saved") return "saved";
  if (state.sub === "papers") return "papers";
  return "etlab";
}

function materialsBody(tab = materialsTab()) {
  if (tab === "saved") return renderSaved();
  if (tab === "papers") return renderModelPapers();
  return renderEtlabMaterials();
}

function renderMaterials() {
  const tab = materialsTab();
  const list = materials();
  const saved = readJson(STORAGE.resources, []);
  const kicker = `${plural(list.length, "file")} from ETLab · ${saved.length} saved`;

  return `
    ${pageHead("Materials", kicker)}
    <div class="toolbar">
      ${segmented(
        [
          { value: "etlab", label: "ETLab" },
          { value: "papers", label: "Model Papers" },
          { value: "saved", label: "Saved" },
        ],
        tab,
        "mat-tab",
        "Materials source",
      )}
    </div>
    <div id="mat-body" class="panel">${materialsBody(tab)}</div>
  `;
}

function renderModelPapers() {
  return `
    <div class="card model-papers-card">
      <a class="model-papers" href="${MODEL_PAPERS_URL}" target="_blank" rel="noopener noreferrer">
        <span class="file-tile" data-kind="papers">KTU</span>
        <span class="mat-text">
          <span class="mat-title">Semester model papers</span>
          <span class="mat-meta">Opens ktu.edu.in</span>
        </span>
        <span class="row-go">${icon("external", 18)}</span>
      </a>
      <ol class="model-papers-flow">
        <li>Find <strong>B.Tech Full Time 2024 Scheme</strong> and tap <strong>Documents</strong>.</li>
        <li>Tap <strong>View</strong> next to <strong>Model Question Papers</strong>.</li>
        <li>Pick your semester, then the paper.</li>
      </ol>
    </div>
  `;
}

function renderEtlabMaterials() {
  const list = materials();
  if (!list.length) {
    return state.syncing
      ? firstSyncState()
      : emptyState({ title: "No materials <em>yet.</em>", text: "Sync with ETLab to pull notes and files." });
  }

  const counts = new Map();
  list.forEach((m) => counts.set(m.code, (counts.get(m.code) || 0) + 1));
  const chips = [["all", "All", list.length], ...[...counts].map(([code, count]) => [code, shortName(nameFor(code)), count])];
  if (!counts.has(state.materialFilter)) state.materialFilter = "all";

  return `
    <div class="filters">
      <label class="search">
        ${icon("search", 18)}
        <input id="material-search" type="search" placeholder="Search titles, subjects, modules" value="${escapeHtml(state.materialQuery)}" autocomplete="off" enterkeyhint="search" />
        <button class="search-clear" type="button" data-action="clear-search" aria-label="Clear search" ${state.materialQuery ? "" : "hidden"}>${icon("close", 16)}</button>
      </label>
      <div class="chips" role="group" aria-label="Filter by subject">
        ${chips
          .map(
            ([code, label, count]) => `
              <button class="chip" type="button" data-action="mat-filter" data-value="${escapeHtml(code)}" aria-pressed="${state.materialFilter === code}">
                ${escapeHtml(label)} <span class="chip-count">${count}</span>
              </button>
            `,
          )
          .join("")}
      </div>
    </div>
    <ul id="materials-list" class="list card">${list.map((m) => materialRow(m)).join("")}</ul>
    <p id="materials-empty" class="muted-note" hidden>Nothing matches that search.</p>
  `;
}

function applyMaterialFilter() {
  const listEl = document.querySelector("#materials-list");
  if (!listEl) return;
  const query = state.materialQuery.trim().toLowerCase();
  let visible = 0;
  listEl.querySelectorAll(".mat").forEach((row) => {
    const show =
      (state.materialFilter === "all" || row.dataset.code === state.materialFilter) &&
      (!query || row.dataset.search.includes(query));
    row.hidden = !show;
    if (show) visible++;
  });
  listEl.hidden = visible === 0;
  document.querySelector("#materials-empty").hidden = visible !== 0;
  document.querySelectorAll('[data-action="mat-filter"]').forEach((chip) => {
    chip.setAttribute("aria-pressed", String(chip.dataset.value === state.materialFilter));
  });
  const clear = document.querySelector(".search-clear");
  if (clear) clear.hidden = !state.materialQuery;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function renderSaved() {
  const saved = readJson(STORAGE.resources, []);
  return `
    <form id="resource-form" class="card add-form" autocomplete="off">
      <div class="field">
        <label for="resource-title">Title</label>
        <input id="resource-title" class="input" name="title" placeholder="DSA playlist" required />
      </div>
      <div class="field">
        <label for="resource-url">Link</label>
        <input id="resource-url" class="input" name="url" inputmode="url" placeholder="drive.google.com/…" required />
      </div>
      <button class="btn btn-primary" type="submit">${icon("plus", 18)} Save link</button>
    </form>
    ${
      saved.length
        ? `<ul class="list card">
            ${saved
              .map((resource, index) => {
                const url = safeUrl(resource.url);
                const host = url ? hostOf(url) : resource.url;
                return `
                  <li class="mat">
                    ${
                      url
                        ? `<a class="mat-head" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">`
                        : `<div class="mat-head">`
                    }
                      <span class="file-tile" data-kind="saved">${escapeHtml((resource.title || host || "?").trim().charAt(0).toUpperCase())}</span>
                      <span class="mat-text">
                        <span class="mat-title">${escapeHtml(resource.title)}</span>
                        <span class="mat-meta">${escapeHtml(host)}</span>
                      </span>
                    ${url ? `</a>` : `</div>`}
                    <button class="icon-btn mat-extra" type="button" data-action="delete-resource" data-index="${index}" aria-label="Remove ${escapeHtml(resource.title)}">${icon("trash", 18)}</button>
                  </li>
                `;
              })
              .join("")}
          </ul>`
        : `<p class="muted-note">Keep Drive folders, playlists and question banks here. They stay on this device.</p>`
    }
  `;
}

/* ---------------------------------------------------------------------------
   Settings
   ------------------------------------------------------------------------ */

function setting(title, hint, control) {
  return `
    <div class="setting">
      <div class="setting-text">
        <p class="setting-title">${title}</p>
        ${hint ? `<p class="setting-hint">${hint}</p>` : ""}
      </div>
      <div class="setting-control">${control}</div>
    </div>
  `;
}

function renderSettings() {
  const info = student();
  const username = state.session?.username || "";
  const fullName = titleCase(info.name || "");
  const initials = fullName
    .split(" ")
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join("");
  const synced = lastSynced();
  const standalone = isStandaloneApp();

  return `
    ${pageHead("Settings")}
    <div class="settings">
      <section class="card profile">
        <span class="avatar display">${escapeHtml(initials || "?")}</span>
        <div class="profile-text">
          <p class="profile-name">${escapeHtml(fullName || username || "ETLab student")}</p>
          <p class="profile-meta">${[username, info.universityRegisterNumber].filter(Boolean).map(escapeHtml).join(" · ")}</p>
        </div>
        <span class="live"><i></i>Connected</span>
      </section>

      <section class="block">
        <h2 class="group-label kicker">Sync</h2>
        <div class="card group">
          ${setting(
            "Last synced",
            synced ? `${formatDayMonth.format(synced)}, ${formatTime.format(synced)}` : "Never",
            `<button class="btn btn-ghost btn-sm" type="button" data-action="sync" ${state.syncing ? "disabled" : ""}>${icon("sync", 16)} Sync now</button>`,
          )}
          ${setting(
            "Stored on this device",
            "Your ETLab data is cached here only. Logging out clears it.",
            "",
          )}
        </div>
      </section>

      <section class="block">
        <h2 class="group-label kicker">Preferences</h2>
        <div class="card group">
          ${setting(
            "Theme",
            "",
            segmented(
              [
                { value: "system", label: "Auto" },
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ],
              getThemePreference(),
              "theme",
              "Theme",
            ),
          )}
          ${setting(
            "Attendance target",
            "Used for “can miss” and warnings.",
            segmented(
              TARGETS.map((t) => ({ value: String(t), label: `${t}%` })),
              String(target()),
              "target",
              "Attendance target",
            ),
          )}
        </div>
      </section>

      <section class="block">
        <h2 class="group-label kicker">App</h2>
        <div class="card group">
          ${setting(
            "Install ETLaban",
            standalone ? "Installed. You're using the app." : "Open it from your home screen like any other app.",
            standalone
              ? `<span class="live"><i></i>Installed</span>`
              : `<button class="btn btn-ghost btn-sm" type="button" data-action="install">${icon("download", 16)} Install</button>`,
          )}
        </div>
        <div class="card group">
          ${setting(
            "Share with friends",
            "Send ETLaban to classmates.",
            `<button class="btn btn-ghost btn-sm" type="button" data-action="share">${icon("share", 16)} Share with friends</button>`,
          )}
        </div>
      </section>

      <section class="block">
        <h2 class="group-label kicker">Advanced</h2>
        <div class="card group">
          <details class="disclosure">
            <summary>Use a session cookie instead ${icon("chevron", 16)}</summary>
            <form id="cookie-form" class="cookie-form">
              <p class="setting-hint">Only if logging in doesn't work. Paste the cookie from a signed-in ETLab tab.</p>
              <textarea class="input textarea" name="cookie" rows="3" placeholder="CETSESSIONID=…" required></textarea>
              <button class="btn btn-ghost btn-sm" type="submit">Save cookie</button>
            </form>
          </details>
        </div>
      </section>

      <section class="block">
        <h2 class="group-label kicker">About</h2>
        <div class="card group">
          ${setting(
            "Open source",
            "ETLaban's code is public. Ideas and fixes are welcome.",
            `<a class="btn btn-ghost btn-sm" href="${REPO_URL}" target="_blank" rel="noopener noreferrer">${GITHUB_MARK} GitHub</a>`,
          )}
        </div>
        <p class="credit">Built by <a href="${AUTHOR_URL}" target="_blank" rel="noopener noreferrer">Abhineeth V S</a></p>
      </section>

      <button class="btn btn-danger btn-block" type="button" data-action="logout">${icon("logout", 18)} Log out</button>
    </div>
  `;
}

/* ---------------------------------------------------------------------------
   Shell, routing, rendering
   ------------------------------------------------------------------------ */

const RENDERERS = {
  home: renderHome,
  attendance: renderAttendance,
  results: renderResults,
  materials: renderMaterials,
  settings: renderSettings,
};

function renderNav() {
  const links = (className) =>
    Object.entries(VIEWS)
      .map(
        ([view, { title, icon: iconName }]) => `
          <a class="${className}" href="#${view}" data-view="${view}">
            <span class="${className}-icon">${icon(iconName, 22)}</span>
            <span class="${className}-label">${title}</span>
          </a>
        `,
      )
      .join("");
  document.querySelector("#rail-nav").innerHTML = links("rail-link");
  document.querySelector("#tabbar").innerHTML = `<span class="tab-indicator" aria-hidden="true"></span>${links("tab")}`;
  document.querySelectorAll("[data-sync-icon]").forEach((el) => {
    el.innerHTML = icon("sync", 20);
  });
}

function updateNav() {
  const index = Object.keys(VIEWS).indexOf(state.view);
  document.querySelector("#tabbar").style.setProperty("--i", index);
  document.querySelectorAll("[data-view]").forEach((link) => {
    if (link.dataset.view === state.view) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  const info = student();
  const name = titleCase(info.name || "");
  document.querySelector("#rail-name").textContent = name || "Your account";
  document.querySelector("#rail-avatar").textContent =
    name
      .split(" ")
      .slice(0, 2)
      .map((w) => w.charAt(0))
      .join("") || "?";
}

function render({ animate = false } = {}) {
  try {
    app.innerHTML = RENDERERS[state.view]();
  } catch (error) {
    // Odd data from ETLab shouldn't blank the page or break sync.
    console.error(error);
    app.innerHTML = `${pageHead(VIEWS[state.view].title)}${emptyState({
      title: "Couldn't show <em>this.</em>",
      text: "Something in the saved data didn't look right. Syncing again usually fixes it.",
    })}`;
  }
  document.title = `${VIEWS[state.view].title} · ETLaban`;
  updateNav();
  updateSyncStatus();
  if (state.view === "materials") applyMaterialFilter();

  clearTimeout(state.enterTimer);
  if (animate) {
    app.classList.remove("view-enter");
    void app.offsetWidth;
    app.classList.add("view-enter");
    state.enterTimer = setTimeout(() => app.classList.remove("view-enter"), 2200);
  } else {
    app.classList.remove("view-enter");
  }
}

function swapPanel(id, html) {
  const panel = document.querySelector(id);
  if (!panel) return;
  panel.innerHTML = html;
  panel.classList.remove("panel-enter");
  void panel.offsetWidth;
  panel.classList.add("panel-enter");
}

function setHash(hash) {
  history.replaceState(null, "", `/app${hash}`);
}

function parseHash() {
  const [rawView = "", sub = null, arg = null] = window.location.hash.replace(/^#\/?/, "").split("/");
  if (LEGACY_ROUTES[rawView]) {
    const legacy = { sub: null, arg: null, ...LEGACY_ROUTES[rawView] };
    setHash(`#${[legacy.view, legacy.sub].filter(Boolean).join("/")}`);
    return legacy;
  }
  return VIEWS[rawView] ? { view: rawView, sub, arg } : { view: "home", sub: null, arg: null };
}

function route() {
  const next = parseHash();
  const changed = next.view !== state.view || !app.childElementCount;
  Object.assign(state, next);

  if (state.view === "attendance") {
    if (state.sub === "calendar" || state.sub === "subjects") writeStorage(STORAGE.attendanceTab, state.sub);
    if (state.sub === "calendar" && state.arg) state.selectedDay = state.arg;
    if (state.sub === "subjects" && state.arg) state.expanded.add(state.arg);
  }

  render({ animate: changed });
  if (changed) window.scrollTo({ top: 0 });

  if (state.view === "attendance" && state.arg && state.sub !== "semester") {
    const focus =
      state.sub === "subjects"
        ? document.querySelector(`.subject[data-code="${CSS.escape(state.arg)}"]`)
        : document.querySelector("#day-panel");
    focus?.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

/* ---------------------------------------------------------------------------
   Toasts
   ------------------------------------------------------------------------ */

function toast(message, { icon: iconName, tone, action, duration = 4200 } = {}) {
  const el = document.createElement("div");
  el.className = "toast";
  if (tone) el.dataset.tone = tone;
  el.innerHTML = `
    ${iconName ? icon(iconName, 18) : ""}
    <span class="toast-text">${escapeHtml(message)}</span>
    ${action ? `<button class="toast-action" type="button">${escapeHtml(action.label)}</button>` : ""}
  `;
  const dismiss = () => {
    el.classList.add("is-leaving");
    el.addEventListener("animationend", () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  };
  if (action) {
    el.querySelector(".toast-action").addEventListener("click", () => {
      action.handler();
      dismiss();
    });
  }
  toastRegion.append(el);
  setTimeout(dismiss, duration);
}

/* ---------------------------------------------------------------------------
   Events
   ------------------------------------------------------------------------ */

const ACTIONS = {
  sync: () => runSync(),

  "att-tab": (button) => {
    updateSegmented(button);
    const tab = button.dataset.value;
    state.sub = tab;
    writeStorage(STORAGE.attendanceTab, tab);
    setHash(`#attendance/${tab}`);
    swapPanel("#att-body", tab === "calendar" ? renderCalendar() : renderSubjectList());
  },

  "select-day": (button) => {
    state.selectedDay = button.dataset.date;
    document.querySelectorAll(".cal-day").forEach((day) => day.setAttribute("aria-pressed", String(day === button)));
    setHash(`#attendance/calendar/${state.selectedDay}`);
    swapPanel("#day-panel", dayPanel());
    if (window.matchMedia("(max-width: 899px)").matches) {
      document.querySelector("#day-panel")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  },

  "toggle-subject": (button) => {
    const row = button.closest(".subject");
    const code = row.dataset.code;
    const open = !state.expanded.has(code);
    if (open) state.expanded.add(code);
    else state.expanded.delete(code);
    row.dataset.open = String(open);
    button.setAttribute("aria-expanded", String(open));
  },

  "att-semester": (button) => {
    document.querySelectorAll(".sem-col").forEach((col) => col.setAttribute("aria-checked", String(col === button)));
    const semester = semesters().find((s) => s.number === Number(button.dataset.value));
    if (semester?.current) {
      state.sub = attendanceTab();
      state.arg = null;
    } else {
      state.sub = "semester";
      state.arg = button.dataset.value;
    }
    setHash(`#attendance/${state.sub}${state.arg ? `/${state.arg}` : ""}`);
    swapPanel("#att-sem", attendanceBody());
  },

  semester: (button) => {
    document.querySelectorAll(".sem-col").forEach((col) => col.setAttribute("aria-checked", String(col === button)));
    state.sub = button.dataset.value;
    setHash(`#results/${state.sub}`);
    swapPanel("#sem-body", semesterBody(selectedSemester()));
  },

  "mat-tab": (button) => {
    updateSegmented(button);
    const tab = button.dataset.value;
    state.sub = tab === "etlab" ? null : tab;
    setHash(state.sub ? `#materials/${state.sub}` : "#materials");
    swapPanel("#mat-body", materialsBody(tab));
    if (tab === "etlab") applyMaterialFilter();
  },

  "mat-filter": (button) => {
    state.materialFilter = button.dataset.value;
    applyMaterialFilter();
  },

  "clear-search": () => {
    state.materialQuery = "";
    const input = document.querySelector("#material-search");
    input.value = "";
    input.focus();
    applyMaterialFilter();
  },

  "delete-resource": (button) => {
    const saved = readJson(STORAGE.resources, []);
    const index = Number(button.dataset.index);
    const [removed] = saved.splice(index, 1);
    writeStorage(STORAGE.resources, saved);
    render();
    toast(`Removed “${removed?.title || "link"}”`, {
      action: {
        label: "Undo",
        handler: () => {
          const current = readJson(STORAGE.resources, []);
          current.splice(index, 0, removed);
          writeStorage(STORAGE.resources, current);
          if (state.view === "materials") render();
        },
      },
    });
  },

  theme: (button) => {
    updateSegmented(button);
    setThemePreference(button.dataset.value, button);
  },

  target: (button) => {
    updateSegmented(button);
    writeStorage(STORAGE.target, button.dataset.value);
    state.cache = {};
    toast(`Attendance target set to ${button.dataset.value}%`, { icon: "check" });
  },

  install: () => promptInstall(),

  share: async () => {
    const url = `${location.origin}/`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "ETLaban", text: "Check out ETLaban", url });
      } catch (error) {
        if (error?.name !== "AbortError") toast("Couldn't share. Try again.", { icon: "check" });
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied. Send it to your friends.", { icon: "check" });
    } catch {
      toast(url, { icon: "check" });
    }
  },

  "dismiss-install": () => {
    writeStorage(STORAGE.installDismissed, "1");
    installCard.classList.add("is-leaving");
    setTimeout(() => {
      installCard.hidden = true;
      installCard.classList.remove("is-leaving");
    }, 300);
  },

  logout: async (button) => {
    button.disabled = true;
    try {
      const response = await fetch("/api/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed");
      clearCachedData();
      rememberSignedIn(false);
      window.location.replace("/");
    } catch (error) {
      button.disabled = false;
      toast(error.message || "Logout failed", { icon: "alert", tone: "danger" });
    }
  },
};

document.addEventListener("click", (event) => {
  // Tapping the tab you're already on scrolls back to the top.
  const navLink = event.target.closest("[data-view]");
  if (navLink && navLink.dataset.view === state.view && !state.sub) {
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  const button = event.target.closest("[data-action]");
  if (!button || button.disabled) return;
  const handler = ACTIONS[button.dataset.action];
  if (!handler) return;
  event.preventDefault();
  handler(button);
});

document.addEventListener("input", (event) => {
  if (event.target.id === "material-search") {
    state.materialQuery = event.target.value;
    applyMaterialFilter();
  }
});

document.addEventListener("submit", async (event) => {
  const form = event.target;

  if (form.id === "resource-form") {
    event.preventDefault();
    const data = new FormData(form);
    const title = String(data.get("title") || "").trim();
    let url = String(data.get("url") || "").trim();
    if (url && !/^[a-z]+:\/\//i.test(url)) url = `https://${url}`;
    if (!title || !safeUrl(url)) {
      toast("Add a title and a valid link.", { icon: "alert", tone: "danger" });
      return;
    }
    const saved = readJson(STORAGE.resources, []);
    saved.unshift({ title, url: safeUrl(url) });
    writeStorage(STORAGE.resources, saved);
    render();
    toast("Link saved", { icon: "check" });
  }

  if (form.id === "cookie-form") {
    event.preventDefault();
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      const response = await fetch("/api/cookie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookie: new FormData(form).get("cookie") }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Couldn't save the cookie");
      clearCachedData();
      await loadData();
      render();
      toast("Session saved. Syncing…", { icon: "check" });
      runSync();
    } catch (error) {
      button.disabled = false;
      toast(error.message, { icon: "alert", tone: "danger" });
    }
  }
});

window.addEventListener("hashchange", route);

/* ---------------------------------------------------------------------------
   Install prompt
   ------------------------------------------------------------------------ */

function isStandaloneApp() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function installDismissed() {
  return localStorage.getItem(STORAGE.installDismissed) === "1";
}

function installAutoPrompted() {
  return localStorage.getItem(STORAGE.installAutoPrompted) === "1";
}

function showInstallCard(visible) {
  installCard.hidden = !(visible && !isStandaloneApp() && !installDismissed());
}

async function promptInstall({ automatic = false } = {}) {
  if (!state.deferredInstallPrompt) {
    if (automatic) return;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    toast(
      isIos
        ? "Tap Share, then “Add to Home Screen”."
        : "Use your browser menu: “Install app” or “Add to Home screen”.",
      { duration: 6500 },
    );
    return;
  }

  state.deferredInstallPrompt.prompt();
  const choice = await state.deferredInstallPrompt.userChoice;
  state.deferredInstallPrompt = null;
  showInstallCard(false);
  if (automatic) writeStorage(STORAGE.installAutoPrompted, "1");
  if (choice.outcome !== "accepted") writeStorage(STORAGE.installDismissed, "1");
}

function scheduleAutoInstallPrompt() {
  if (isStandaloneApp() || installDismissed() || installAutoPrompted()) return;
  window.setTimeout(() => {
    if (isStandaloneApp() || installDismissed() || installAutoPrompted() || !state.deferredInstallPrompt) return;
    promptInstall({ automatic: true }).catch(() => {});
  }, INSTALL_AUTO_DELAY_MS);
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  state.deferredInstallPrompt = event;
  showInstallCard(true);
  scheduleAutoInstallPrompt();
});

window.addEventListener("appinstalled", () => {
  state.deferredInstallPrompt = null;
  writeStorage(STORAGE.installDismissed, "1");
  writeStorage(STORAGE.installAutoPrompted, "1");
  showInstallCard(false);
  toast("Installed. Find ETLaban on your home screen.", { icon: "check" });
});

/* ---------------------------------------------------------------------------
   Boot
   ------------------------------------------------------------------------ */

state.cache = {};
initTheme();
registerServiceWorker();
renderNav();
scheduleAutoInstallPrompt();
setInterval(updateSyncStatus, 60 * 1000);

const session = await getSession();
await loadData();

// Offline (e.g. installed app with no signal): still show the cached copy.
const canShowOffline = session.offline && hasData();

if (!session.loggedIn && !canShowOffline) {
  revealPage();
  window.location.replace(session.expired ? "/login?expired=1" : "/login");
} else {
  state.session = session;
  const params = new URLSearchParams(window.location.search);
  const fromLogin = params.get("sync") === "1";
  if (params.has("sync")) setHash(window.location.hash);

  route();
  revealPage();
  shell.classList.add("is-ready");

  if (session.loggedIn && (fromLogin || !hasData())) runSync({ fromLogin: true });
  else if (session.loggedIn && isStale()) runSync({ quiet: true });
  else if (canShowOffline) toast("You're offline. Showing your last synced data.", { duration: 5000 });
}
