const DATA_SOURCES = {
  materials: ["/api/materials", "materials.json"],
  attendanceSubject: ["/api/attendance/subject", "attendance-subject.json"],
  attendanceMonth: ["/api/attendance/month", "attendance-month.json"],
  attendanceDetails: ["/api/attendance/day-details", "attendance-day-details.json"],
  results: ["/api/results", "results.json"],
  status: ["/api/status"],
  me: ["/api/me"],
};

const app = document.querySelector("#app");
const viewTitle = document.querySelector("#view-title");
const syncStatus = document.querySelector("#sync-status");
const syncButton = document.querySelector("#sync-button");
const refreshButton = document.querySelector("#refresh-button");
const navItems = [...document.querySelectorAll(".nav-item")];

const state = {
  view: "dashboard",
  data: {},
  syncMessage: null,
  syncLog: null,
  settingsMessage: null,
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return response.json();
}

async function fetchJsonFromSources(paths) {
  let lastError;

  for (const path of paths) {
    try {
      return await fetchJson(path);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

async function loadData() {
  syncStatus.textContent = "Loading data...";

  const entries = await Promise.all(
    Object.entries(DATA_SOURCES).map(async ([key, paths]) => {
      try {
        return [key, await fetchJsonFromSources(paths)];
      } catch {
        return [key, null];
      }
    }),
  );

  state.data = Object.fromEntries(entries);
  syncStatus.textContent = `Updated ${new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function getPercentValue(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  const match = String(value).match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function attendanceTone(percent) {
  if (percent < 75) return "bad";
  if (percent < 85) return "warn";
  return "good";
}

function progressClass(percent) {
  if (percent < 75) return "bad";
  if (percent < 85) return "warn";
  return "";
}

function dayDetailsByDate() {
  const details = state.data.attendanceDetails || [];
  return new Map(details.map((day) => [day.date, day.periods || []]));
}

function setView(view) {
  state.view = view;
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  render();
}

function render() {
  const title = {
    dashboard: "Dashboard",
    attendance: "Attendance",
    results: "Results",
    materials: "Study Materials",
    resources: "Resources",
    settings: "Settings",
  }[state.view];

  viewTitle.textContent = title;

  const renderer = {
    dashboard: renderDashboard,
    attendance: renderAttendance,
    results: renderResults,
    materials: renderMaterials,
    resources: renderResources,
    settings: renderSettings,
  }[state.view];

  app.innerHTML = renderer();
  attachViewHandlers();
}

function sessionBanner() {
  const me = state.data.me;
  if (!me) return "";
  if (me.hasCookie && me.sessionValid === false) {
    return `
      <section class="card soft">
        <h2>Session expired</h2>
        <p class="muted">Your ETLab session is no longer valid. Go to Settings and login again, then Sync.</p>
      </section>
    `;
  }
  if (!me.hasCookie) {
    return `
      <section class="card soft">
        <h2>Not logged in</h2>
        <p class="muted">Go to Settings, login with your ETLab account, then Sync to refresh data.</p>
      </section>
    `;
  }
  return "";
}

function renderDashboard() {
  const subjects = state.data.attendanceSubject?.subjects || [];
  const materials = state.data.materials || [];
  const sessionals = state.data.results?.assessmentResults?.sessionalExams?.items || [];
  const month = state.data.attendanceMonth;
  const overallPercent = getPercentValue(state.data.attendanceSubject?.summary?.percentage);
  const lowSubjects = subjects
    .map((subject) => ({
      ...subject,
      percent: getPercentValue(subject.attendance?.percentage),
    }))
    .filter((subject) => subject.percent < 85);

  return `
    ${sessionBanner()}
    <div class="grid cols-3">
      ${metricCard("Overall Attendance", `${overallPercent || "-"}%`, `${month?.summary?.total || ""} this month`, attendanceTone(overallPercent))}
      ${metricCard("Materials", materials.length, "Study files and links", "good")}
      ${metricCard("Results", sessionals.length, "Published sessional entries", "warn")}
    </div>

    <div class="grid cols-2">
      <section class="card">
        <h2>Needs Attention</h2>
        ${
          lowSubjects.length
            ? `<div class="list">${lowSubjects
                .map(
                  (subject) => `
                    <div class="list-item">
                      <div>
                        <strong>${escapeHtml(subject.code)}</strong>
                        <span class="muted">${escapeHtml(subject.attendance?.raw || "")}</span>
                      </div>
                      <span class="pill ${attendanceTone(subject.percent)}">${subject.percent}%</span>
                    </div>
                  `,
                )
                .join("")}</div>`
            : `<p class="muted">No subject is below 85% right now.</p>`
        }
      </section>

      <section class="card">
        <h2>Recent Materials</h2>
        <div class="list">
          ${materials
            .slice(0, 5)
            .map(
              (material) => `
                <div class="list-item">
                  <div>
                    <strong>${escapeHtml(material.title)}</strong>
                    <span class="muted">${escapeHtml(material.subject)}</span>
                  </div>
                  ${material.fileUrl ? `<a href="${material.fileUrl}" target="_blank" rel="noreferrer">Open</a>` : ""}
                </div>
              `,
            )
            .join("")}
        </div>
      </section>
    </div>
  `;
}

function metricCard(label, value, helper, tone) {
  return `
    <section class="card">
      <div class="metric">
        <div>
          <p class="muted">${escapeHtml(label)}</p>
          <div class="metric-value">${escapeHtml(value)}</div>
          <span class="muted">${escapeHtml(helper)}</span>
        </div>
        <span class="pill ${tone}">${escapeHtml(tone)}</span>
      </div>
    </section>
  `;
}

function renderAttendance() {
  const subjects = state.data.attendanceSubject?.subjects || [];
  const month = state.data.attendanceMonth;
  const details = dayDetailsByDate();

  if (!subjects.length && !month) {
    return emptyState();
  }

  return `
    <section class="card">
      <h2>Subject Attendance</h2>
      <div class="subject-grid">
        ${subjects
          .map((subject) => {
            const percent = getPercentValue(subject.attendance?.percentage);
            return `
              <article class="subject-card">
                <div class="metric">
                  <div>
                    <strong>${escapeHtml(subject.code)}</strong>
                    <p class="muted">${escapeHtml(subject.attendance?.raw || "")}</p>
                  </div>
                  <span class="pill ${attendanceTone(percent)}">${percent}%</span>
                </div>
                <div class="progress"><span class="${progressClass(percent)}" style="width:${Math.min(percent, 100)}%"></span></div>
              </article>
            `;
          })
          .join("")}
      </div>
    </section>

    <section class="card">
      <h2>Month View</h2>
      <p class="muted">${escapeHtml(month?.summary?.percentage || "-")} for this month, ${escapeHtml(month?.summary?.percentageForSemester || "-")} for semester.</p>
      <div class="calendar">
        ${(month?.days || [])
          .map((day) => {
            const periods = details.get(day.date) || [];
            const percent = getPercentValue(day.attendance?.percentage);
            const low = day.attendance?.total > 0 && percent < 75;
            return `
              <article class="day ${escapeHtml(day.status)} ${low ? "low" : ""}">
                <strong>${day.day}</strong>
                <span class="muted">${escapeHtml(day.attendance?.raw || day.status)}</span>
                ${
                  periods.length
                    ? `<div class="periods">${periods
                        .map(
                          (period) => `
                            <span class="period ${period.status === "absent" ? "absent" : ""}" title="${escapeHtml(period.subject)}">
                              P${period.period}
                            </span>
                          `,
                        )
                        .join("")}</div>`
                    : ""
                }
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderResults() {
  const results = state.data.results;
  if (!results) return emptyState();

  const assessmentSections = Object.values(results.assessmentResults || {});

  return `
    <div class="grid cols-2">
      <section class="card">
        <h2>Published Assessments</h2>
        <div class="list">
          ${assessmentSections
            .map(
              (section) => `
                <div class="list-item">
                  <div>
                    <strong>${escapeHtml(section.label)}</strong>
                    <span class="muted">${section.items.length} entries</span>
                  </div>
                </div>
                ${section.items
                  .map(
                    (item) => `
                      <div class="list-item">
                        <div>
                          <strong>${escapeHtml(item.subject || item.name || item.title || "Result")}</strong>
                          <span class="muted">${escapeHtml(item.exam || item.assignment || item.semester || "")}</span>
                        </div>
                        <span class="pill">${escapeHtml(item.marksObtained || item.marks || "-")}/${escapeHtml(item.maximumMarks || item.total || "-")}</span>
                      </div>
                    `,
                  )
                  .join("")}
              `,
            )
            .join("")}
        </div>
      </section>

      <section class="card">
        <h2>University Summary</h2>
        <div class="list">
          ${(results.universityResult || [])
            .map(
              (subject) => `
                <div class="list-item">
                  <div>
                    <strong>${escapeHtml(subject.subjectCode)}</strong>
                    <span class="muted">${escapeHtml(subject.subjectName)}</span>
                  </div>
                  <div>
                    <span class="pill">${escapeHtml(subject.grade || "-")}</span>
                    <span class="pill">${escapeHtml(subject.attendancePercentage || "-")}</span>
                  </div>
                </div>
              `,
            )
            .join("")}
        </div>
      </section>
    </div>
  `;
}

function renderMaterials() {
  const materials = state.data.materials || [];

  return `
    <section class="card">
      <div class="toolbar">
        <input id="material-search" class="search" type="search" placeholder="Search subject, title, module..." />
        <span class="pill">${materials.length} items</span>
      </div>
      <div id="materials-list" class="list">
        ${renderMaterialItems(materials)}
      </div>
    </section>
  `;
}

function renderMaterialItems(materials) {
  if (!materials.length) {
    return `<p class="muted">No materials found.</p>`;
  }

  return materials
    .map(
      (material) => `
        <article class="list-item material-item"
          data-search="${escapeHtml(`${material.subject} ${material.title} ${material.module} ${material.details}`.toLowerCase())}">
          <div>
            <strong>${escapeHtml(material.title)}</strong>
            <span class="muted">${escapeHtml(material.subject)}</span>
            <p class="muted">${escapeHtml([material.module, material.details, material.created].filter(Boolean).join(" · "))}</p>
          </div>
          <div>
            ${material.fileUrl ? `<a href="${material.fileUrl}" target="_blank" rel="noreferrer">File</a>` : ""}
            ${material.linkUrl ? `<a href="${material.linkUrl}" target="_blank" rel="noreferrer">Link</a>` : ""}
          </div>
        </article>
      `,
    )
    .join("");
}

function renderResources() {
  const resources = JSON.parse(localStorage.getItem("better-etlab-resources") || "[]");

  return `
    <section class="card">
      <h2>Your Resources</h2>
      <p class="muted">Add Google Drive notes, YouTube playlists, question banks, or any link ETLab does not manage well.</p>
      <form id="resource-form" class="toolbar">
        <input class="search" name="title" placeholder="Title" required />
        <input class="search" name="url" placeholder="https://drive.google.com/..." required />
        <button class="button" type="submit">Add</button>
      </form>
      <div class="list">
        ${
          resources.length
            ? resources
                .map(
                  (resource, index) => `
                    <div class="list-item">
                      <div>
                        <strong>${escapeHtml(resource.title)}</strong>
                        <span class="muted">${escapeHtml(resource.url)}</span>
                      </div>
                      <a href="${escapeHtml(resource.url)}" target="_blank" rel="noreferrer">Open</a>
                      <button class="button secondary" data-delete-resource="${index}">Delete</button>
                    </div>
                  `,
                )
                .join("")
            : `<p class="muted">No custom resources yet.</p>`
        }
      </div>
    </section>
  `;
}

function renderSettings() {
  const status = state.data.status;
  const me = state.data.me;
  const files = status?.files ? Object.entries(status.files) : [];
  const sessionValid = me?.sessionValid;
  const sessionPill =
    sessionValid === true ? "good" : sessionValid === false ? "bad" : status?.hasCookie ? "warn" : "bad";
  const sessionLabel =
    sessionValid === true ? "Valid" : sessionValid === false ? "Expired" : status?.hasCookie ? "Unknown" : "Missing";

  return `
    <div class="grid cols-2">
      ${sessionBanner()}
      <section class="card">
        <h2>ETLab Login</h2>
        <p class="muted">Sign in with your normal ETLab username and password. The backend stores only the session cookie locally.</p>
        ${
          status?.username
            ? `<div class="list-item">
                <div>
                  <strong>${escapeHtml(status.username)}</strong>
                  <span class="muted">Logged in ${escapeHtml(status.loggedInAt || "")}</span>
                </div>
                <span class="pill ${sessionPill}">${sessionLabel}</span>
              </div>`
            : ""
        }
        <form id="login-form" class="list">
          <input class="search" name="username" placeholder="ETLab username" required />
          <input class="search" name="password" type="password" placeholder="ETLab password" required />
          <div class="toolbar">
            <button class="button" type="submit">Login</button>
            <button class="button secondary" type="button" id="logout-button">Logout</button>
          </div>
          ${state.settingsMessage ? `<p class="muted">${escapeHtml(state.settingsMessage)}</p>` : ""}
        </form>
      </section>

      <section class="card">
        <h2>Sync Status</h2>
        <div class="list">
          <div class="list-item">
            <div>
              <strong>Session Cookie</strong>
              <span class="muted">${status?.cookieSource ? `Loaded from ${status.cookieSource}` : "Not detected"}</span>
            </div>
            <span class="pill ${sessionPill}">${sessionLabel}</span>
          </div>
          <div class="list-item">
            <div>
              <strong>Last UI Refresh</strong>
              <span class="muted">${escapeHtml(syncStatus.textContent || "-")}</span>
            </div>
          </div>
          ${
            state.syncMessage
              ? `<div class="list-item">
                  <div>
                    <strong>Last Sync</strong>
                    <span class="muted">${escapeHtml(state.syncMessage)}</span>
                  </div>
                </div>`
              : ""
          }
        </div>
      </section>

      <section class="card">
        <h2>Data Files</h2>
        <div class="list">
          ${
            files.length
              ? files
                  .map(
                    ([fileName, file]) => `
                      <div class="list-item">
                        <div>
                          <strong>${escapeHtml(fileName)}</strong>
                          <span class="muted">${escapeHtml(file.endpoint)} · ${escapeHtml(file.updatedAt || "not generated")}</span>
                        </div>
                        <span class="pill ${file.exists ? "good" : "bad"}">${file.count}</span>
                      </div>
                    `,
                  )
                  .join("")
              : `<p class="muted">Backend status is available only when running <code>python backend_server.py</code>.</p>`
          }
        </div>
      </section>

      <section class="card">
        <h2>Last Sync Log</h2>
        ${
          state.syncLog
            ? `<pre class="log-output">${escapeHtml(state.syncLog)}</pre>`
            : `<p class="muted">No sync log for this browser session yet.</p>`
        }
      </section>

      <section class="card">
        <h2>Advanced: Manual Cookie</h2>
        <p class="muted">Fallback only. Prefer Login above.</p>
        <form id="cookie-form" class="list">
          <textarea id="cookie-input" class="textarea" name="cookie" rows="4" placeholder="YII_CSRF_TOKEN=...; CETSESSIONID=..." required></textarea>
          <button class="button secondary" type="submit">Save Cookie</button>
        </form>
      </section>
    </div>
  `;
}

function emptyState() {
  return document.querySelector("#empty-state-template").innerHTML;
}

function attachViewHandlers() {
  const search = document.querySelector("#material-search");
  if (search) {
    search.addEventListener("input", () => {
      const value = search.value.trim().toLowerCase();
      document.querySelectorAll(".material-item").forEach((item) => {
        item.hidden = value && !item.dataset.search.includes(value);
      });
    });
  }

  const form = document.querySelector("#resource-form");
  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const resources = JSON.parse(localStorage.getItem("better-etlab-resources") || "[]");
      resources.unshift({
        title: formData.get("title"),
        url: formData.get("url"),
      });
      localStorage.setItem("better-etlab-resources", JSON.stringify(resources));
      render();
    });
  }

  document.querySelectorAll("[data-delete-resource]").forEach((button) => {
    button.addEventListener("click", () => {
      const resources = JSON.parse(localStorage.getItem("better-etlab-resources") || "[]");
      resources.splice(Number(button.dataset.deleteResource), 1);
      localStorage.setItem("better-etlab-resources", JSON.stringify(resources));
      render();
    });
  });

  const cookieForm = document.querySelector("#cookie-form");
  if (cookieForm) {
    cookieForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(cookieForm);
      state.settingsMessage = "Saving cookie...";
      render();

      try {
        const response = await fetch("/api/cookie", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ cookie: formData.get("cookie") }),
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || "Failed to save cookie");
        }

        state.settingsMessage = "Cookie saved. Sync is ready.";
        await loadData();
      } catch (error) {
        state.settingsMessage = error.message || "Failed to save cookie";
      }
      render();
    });
  }

  const loginForm = document.querySelector("#login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(loginForm);
      state.settingsMessage = "Logging in to ETLab...";
      render();

      try {
        const response = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: formData.get("username"),
            password: formData.get("password"),
          }),
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || "Login failed");
        }
        state.settingsMessage = `Logged in as ${result.login?.username || result.username || formData.get("username")}. Syncing...`;
        await loadData();
        render();
        await runSync({ forceRefresh: true, fromLogin: true });
        state.settingsMessage = `Logged in as ${result.login?.username || formData.get("username")}. Sync finished.`;
      } catch (error) {
        state.settingsMessage = error.message || "Login failed";
      }
      render();
    });
  }

  const logoutButton = document.querySelector("#logout-button");
  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      state.settingsMessage = "Logging out...";
      render();
      try {
        const response = await fetch("/api/logout", { method: "POST" });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || "Logout failed");
        }
        state.settingsMessage = "Logged out. Local session cleared.";
        await loadData();
      } catch (error) {
        state.settingsMessage = error.message || "Logout failed";
      }
      render();
    });
  }
}

navItems.forEach((item) => {
  item.addEventListener("click", () => setView(item.dataset.view));
});

refreshButton.addEventListener("click", async () => {
  await loadData();
  render();
});

async function runSync({ forceRefresh = true, fromLogin = false } = {}) {
  syncButton.disabled = true;
  syncStatus.textContent = fromLogin ? "Logged in. Syncing ETLab..." : "Syncing ETLab...";

  try {
    const response = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ forceRefresh }),
    });
    const result = await response.json();
    if (!response.ok) {
      state.syncLog = [result.error, result.stdout, result.stderr].filter(Boolean).join("\n\n");
      if (response.status === 401) {
        await loadData();
      }
      throw new Error(result.error || "Sync failed");
    }
    state.syncLog = [result.stdout, result.stderr].filter(Boolean).join("\n\n").trim();
    state.syncMessage = `Success at ${new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
    await loadData();
    render();
  } catch (error) {
    state.syncMessage = error.message || "Sync failed";
    syncStatus.textContent = state.syncMessage;
    render();
    throw error;
  } finally {
    syncButton.disabled = false;
  }
}

syncButton.addEventListener("click", async () => {
  try {
    await runSync({ forceRefresh: true });
  } catch {
    // Error already shown in UI.
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

await loadData();
render();
