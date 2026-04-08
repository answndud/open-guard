const state = {
  overview: null,
  jobsById: new Map(),
  selectedJobId: null,
  refreshTimer: null,
  isRefreshing: false,
};

const els = {
  dashboardStatus: document.getElementById("dashboard-note"),
  dashboardRefresh: document.getElementById("dashboard-refresh"),
  summaryScore: document.getElementById("summary-score"),
  summaryRisk: document.getElementById("summary-risk"),
  summaryFindings: document.getElementById("summary-findings"),
  summaryJobs: document.getElementById("summary-jobs"),
  summaryTargets: document.getElementById("summary-targets"),
  summaryPolicy: document.getElementById("summary-policy"),
  summaryTarget: document.getElementById("summary-target"),
  targetsMeta: document.getElementById("targets-meta"),
  targetsTable: document.getElementById("targets-table"),
  runsTableMeta: document.getElementById("runs-table-meta"),
  runsTable: document.getElementById("runs-table"),
  jobsMeta: document.getElementById("jobs-meta"),
  jobsTable: document.getElementById("jobs-table"),
  jobDetailStatus: document.getElementById("job-detail-status"),
  jobDetail: document.getElementById("job-detail"),
  auditMeta: document.getElementById("audit-meta"),
  auditFeed: document.getElementById("audit-feed"),
  scanForm: document.getElementById("scan-form"),
  policyForm: document.getElementById("policy-form"),
  signForm: document.getElementById("sign-form"),
  verifyForm: document.getElementById("verify-form"),
  scanResult: document.getElementById("scan-result"),
  policyResult: document.getElementById("policy-result"),
  signResult: document.getElementById("sign-result"),
  verifyResult: document.getElementById("verify-result"),
  scanTarget: document.getElementById("scan-target"),
  policyTarget: document.getElementById("policy-target"),
  signArtifact: document.getElementById("sign-artifact"),
  verifyArtifact: document.getElementById("verify-artifact"),
  statusPills: Array.from(document.querySelectorAll("[data-job-filter]")),
};

const DEFAULT_REFRESH_MS = 5000;

async function init() {
  if (!els.summaryScore || !els.jobsTable || !els.targetsTable) {
    return;
  }

  bindForms();
  bindTables();
  await refreshDashboard();
  state.refreshTimer = window.setInterval(() => {
    if (!document.hidden) {
      void refreshDashboard({ silent: true });
    }
  }, DEFAULT_REFRESH_MS);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      void refreshDashboard({ silent: true });
    }
  });
}

function bindForms() {
  const bindings = [
    [els.scanForm, buildScanJob],
    [els.policyForm, buildPolicyJob],
    [els.signForm, buildSignJob],
    [els.verifyForm, buildVerifyJob],
  ];

  for (const [form, builder] of bindings) {
    if (!form) {
      continue;
    }
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const resultNode = resultNodeFor(form);
      try {
        const payload = builder(form);
        await submitJob(payload, resultNode);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid form input";
        replaceChildren(resultNode, createStatusNote(message, "error"));
        setBanner(message);
      }
    });
  }
}

function bindTables() {
  if (els.targetsTable) {
    els.targetsTable.addEventListener("click", (event) => {
      const row = event.target instanceof Element
        ? event.target.closest("[data-target-path]")
        : null;
      if (!(row instanceof HTMLElement)) {
        return;
      }
      const targetPath = row.dataset.targetPath;
      if (!targetPath) {
        return;
      }
      if (els.scanTarget) {
        els.scanTarget.value = targetPath;
      }
      if (els.policyTarget) {
        els.policyTarget.value = targetPath;
      }
      setBanner(`Loaded target ${targetPath} into the action forms.`);
    });
  }

  if (els.jobsTable) {
    els.jobsTable.addEventListener("click", (event) => {
      const row = event.target instanceof Element
        ? event.target.closest("[data-job-id]")
        : null;
      if (!(row instanceof HTMLElement)) {
        return;
      }
      const jobId = row.dataset.jobId;
      if (jobId) {
        selectJob(jobId);
      }
    });
  }
}

async function refreshDashboard({ silent = false } = {}) {
  if (state.isRefreshing) {
    return;
  }
  state.isRefreshing = true;
  if (!silent) {
    setBanner("Refreshing dashboard data...");
  }

  try {
    const payload = await loadDashboardPayload();
    state.overview = normalizeDashboardPayload(payload);
    state.jobsById = new Map(state.overview.jobs.map((job) => [job.id, job]));
    if (!state.selectedJobId || !state.jobsById.has(state.selectedJobId)) {
      state.selectedJobId = state.overview.jobs[0]?.id ?? null;
    }
    renderDashboard();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to refresh dashboard";
    setBanner(message);
  } finally {
    state.isRefreshing = false;
    updateRefreshStamp();
  }
}

async function loadDashboardPayload() {
  const overview = await fetchJson("/api/overview");
  if (overview) {
    return overview;
  }

  const [summary, runs, jobs, targets, audit] = await Promise.all([
    fetchJson("/api/summary"),
    fetchJson("/api/runs"),
    fetchJson("/api/jobs"),
    fetchJson("/api/targets"),
    fetchJson("/api/audit"),
  ]);

  return {
    summary,
    runs,
    jobs,
    targets,
    audit,
  };
}

function normalizeDashboardPayload(payload) {
  const summaryPayload = payload?.latest_summary ?? payload?.summary ?? null;
  const latestRun = payload?.run ?? payload?.latest_run ?? summaryPayload?.run ?? null;
  let latestSummary = null;
  if (summaryPayload?.summary) {
    latestSummary = summaryPayload;
  } else if (summaryPayload?.total_score !== undefined) {
    latestSummary = {
      summary: summaryPayload,
      target: payload?.target ?? null,
      policy_present: Boolean(payload?.policy_present),
    };
  }

  const runs = normalizeRuns(payload, latestRun, latestSummary);
  const jobs = normalizeJobs(payload);
  const targets = normalizeTargets(payload, latestRun, jobs);
  const audit = normalizeAudit(payload, jobs);

  return {
    latestSummary,
    latestRun,
    runs,
    jobs,
    targets,
    audit,
  };
}

function normalizeRuns(payload, latestRun, latestSummary) {
  const runs = arrayFromPayload(payload, "runs", "recent_runs");
  const mapped = runs.map((entry) => ({
    id: String(entry.id),
    created: String(entry.created ?? ""),
    total_score: Number(entry.total_score ?? 0),
    policy: entry.policy ? String(entry.policy) : undefined,
    action: entry.action ? String(entry.action) : undefined,
    target_label: entry.target_label ? String(entry.target_label) : undefined,
  }));

  if (mapped.length === 0 && latestRun && latestSummary) {
    mapped.push({
      id: String(latestRun.id),
      created: String(latestRun.created ?? ""),
      total_score: Number(latestSummary.summary?.total_score ?? 0),
      policy: latestRun.policy ? String(latestRun.policy) : undefined,
    });
  }

  return mapped.sort((a, b) => {
    if (a.created === b.created) {
      return b.id.localeCompare(a.id);
    }
    return a.created < b.created ? 1 : -1;
  });
}

function normalizeJobs(payload) {
  const jobs = arrayFromPayload(payload, "jobs", "recent_jobs");
  return jobs
    .map((job) => ({
      id: String(job.id),
      action: String(job.action ?? "unknown"),
      status: String(job.status ?? "queued"),
      created_at: String(job.created_at ?? ""),
      started_at: job.started_at ? String(job.started_at) : undefined,
      finished_at: job.finished_at ? String(job.finished_at) : undefined,
      request: job.request ?? null,
      result: job.result ?? null,
      error: job.error ? String(job.error) : undefined,
      command_preview: job.command_preview ? String(job.command_preview) : "",
      events: Array.isArray(job.events) ? job.events : [],
      sensitive: Boolean(job.sensitive),
    }))
    .sort((a, b) => {
      if (a.created_at === b.created_at) {
        return b.id.localeCompare(a.id);
      }
      return a.created_at < b.created_at ? 1 : -1;
    });
}

function normalizeTargets(payload, latestRun, jobs) {
  const targets = arrayFromPayload(payload, "targets", "tracked_targets");
  const normalized = targets
    .map((target, index) => {
      const path = String(target.path ?? target.resolved_path ?? target.input ?? "");
      const lastJob = target.last_job_id
        ? jobs.find((job) => job.id === target.last_job_id)
        : null;
      return {
        id: String(target.id ?? `${path || "target"}-${index}`),
        label: String(target.label ?? target.name ?? (path || "Target")),
        path,
        kind: String(target.kind ?? target.source_kind ?? inferSourceKind(path)),
        last_run_id: target.last_run_id
          ? String(target.last_run_id)
          : target.latest_run_id
            ? String(target.latest_run_id)
            : undefined,
        last_action: String(
          target.last_action ?? target.latest_action ?? lastJob?.action ?? "scan",
        ),
        last_status: String(
          target.last_status ?? target.latest_status ?? lastJob?.status ?? "unknown",
        ),
        last_score:
          target.last_score !== undefined && target.last_score !== null
            ? Number(target.last_score)
            : target.latest_score !== undefined && target.latest_score !== null
              ? Number(target.latest_score)
              : undefined,
        updated_at:
          target.updated_at
            ? String(target.updated_at)
            : target.last_seen_at
              ? String(target.last_seen_at)
              : undefined,
      };
    })
    .filter((target) => target.path);

  if (normalized.length === 0 && latestRun?.target) {
    normalized.push({
      id: String(latestRun.target.resolved_path ?? latestRun.target.input ?? "target"),
      label: String(latestRun.target.input ?? "Latest target"),
      path: String(latestRun.target.resolved_path ?? latestRun.target.input ?? ""),
      kind: inferSourceKind(
        String(latestRun.target.resolved_path ?? latestRun.target.input ?? ""),
      ),
      last_run_id: latestRun.id ? String(latestRun.id) : undefined,
      last_action: "scan",
      last_status: "succeeded",
      last_score: latestRun.summary?.total_score
        ? Number(latestRun.summary.total_score)
        : undefined,
      updated_at: latestRun.created ? String(latestRun.created) : undefined,
    });
  }

  return normalized;
}

function normalizeAudit(payload, jobs) {
  const audit = arrayFromPayload(payload, "audit", "events");
  if (audit.length > 0) {
    return audit
      .map((entry) => ({
        id: String(entry.id ?? `${entry.created_at ?? entry.at ?? "audit"}-${entry.action ?? "event"}`),
        created_at: String(entry.created_at ?? entry.at ?? ""),
        actor: String(entry.actor ?? "local-dashboard"),
        action: String(entry.action ?? "event"),
        target: String(
          entry.target ??
            entry.target_path ??
            entry.target_id ??
            inferAuditTarget(entry, jobs) ??
            "Unknown target",
        ),
        status: String(entry.status ?? "info"),
        job_id: entry.job_id ? String(entry.job_id) : undefined,
        message: entry.message ? String(entry.message) : undefined,
      }))
      .sort((a, b) => {
        if (a.created_at === b.created_at) {
          return b.id.localeCompare(a.id);
        }
        return a.created_at < b.created_at ? 1 : -1;
      });
  }

  return jobs.slice(0, 10).map((job) => ({
    id: job.id,
    created_at: job.created_at,
    actor: "local-dashboard",
    action: job.action,
    target: inferJobTarget(job),
    status: job.status,
    job_id: job.id,
    message: job.error ?? job.result?.output?.slice(0, 120) ?? "Local job event",
  }));
}

function arrayFromPayload(payload, ...keys) {
  for (const key of keys) {
    const value = payload?.[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function renderDashboard() {
  const overview = state.overview;
  if (!overview) {
    renderEmptyDashboard();
    return;
  }

  const latestSummary = overview.latestSummary;
  const latestRun = overview.latestRun;
  const activeJobs = overview.jobs.filter(isActiveJob);

  els.summaryScore.textContent = latestSummary?.summary?.total_score !== undefined
    ? String(latestSummary.summary.total_score)
    : latestRun?.total_score !== undefined
      ? String(latestRun.total_score)
      : "--";
  els.summaryRisk.textContent = latestSummary?.summary?.risk_level
    ? formatRiskLabel(latestSummary.summary.risk_level)
    : latestRun?.risk_level
      ? formatRiskLabel(latestRun.risk_level)
      : "No data";
  els.summaryFindings.textContent = latestSummary?.summary?.counts?.total !== undefined
    ? String(latestSummary.summary.counts.total)
    : latestRun?.findings_total !== undefined
      ? String(latestRun.findings_total)
      : "--";
  els.summaryJobs.textContent = String(activeJobs.length);
  els.summaryTargets.textContent = String(overview.targets.length);
  els.summaryPolicy.textContent =
    latestSummary?.policy_present || latestRun?.policy ? "Attached" : "Missing";
  els.summaryTarget.textContent = formatTargetLabel(
    latestSummary?.target?.resolved_path ??
      latestSummary?.target?.input ??
      latestRun?.target_label ??
      overview.targets[0]?.path ??
      "No target",
  );

  els.targetsMeta.textContent = overview.targets.length
    ? `${overview.targets.length} tracked targets`
    : "No targets yet";
  els.runsTableMeta.textContent = overview.runs.length
    ? `${Math.min(overview.runs.length, 10)} recent runs`
    : "No runs yet";
  els.jobsMeta.textContent = overview.jobs.length
    ? `${activeJobs.length} active, ${overview.jobs.length} total`
    : "No jobs yet";
  els.auditMeta.textContent = overview.audit.length
    ? `${overview.audit.length} events`
    : "No audit events";

  renderTargets(overview.targets, overview.runs);
  renderRuns(overview.runs, latestRun?.id);
  renderJobs(overview.jobs);
  renderJobDetail(state.selectedJobId ? state.jobsById.get(state.selectedJobId) ?? null : null);
  renderAudit(overview.audit);
  updateBannerForJobs(activeJobs);
}

function renderEmptyDashboard() {
  els.summaryScore.textContent = "--";
  els.summaryRisk.textContent = "No data";
  els.summaryFindings.textContent = "--";
  els.summaryJobs.textContent = "0";
  els.summaryTargets.textContent = "0";
  els.summaryPolicy.textContent = "--";
  els.summaryTarget.textContent = "No saved runs yet.";
  els.targetsMeta.textContent = "No targets yet";
  els.runsTableMeta.textContent = "No runs yet";
  els.jobsMeta.textContent = "No jobs yet";
  els.auditMeta.textContent = "No audit events";
  renderTargets([], []);
  renderRuns([]);
  renderJobs([]);
  renderJobDetail(null);
  renderAudit([]);
}

function renderTargets(targets, runs) {
  if (!targets.length) {
    replaceChildren(
      els.targetsTable,
      buildEmptyRow(4, "No target records yet."),
    );
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const target of targets) {
    const row = document.createElement("tr");
    row.dataset.targetPath = target.path;
    row.className = "selectable-row";

    row.append(
      buildTargetCell(target),
      buildTargetRunCell(target, runs),
      buildTextCell(target.last_action || "scan"),
      buildStatusCell(target.last_status || "unknown"),
    );
    fragment.appendChild(row);
  }
  replaceChildren(els.targetsTable, fragment);
}

function renderRuns(runs) {
  if (!runs.length) {
    replaceChildren(els.runsTable, buildEmptyRow(4, "No runs saved yet."));
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const run of runs.slice(0, 10)) {
    const row = document.createElement("tr");
    row.append(
      buildRunCell(run),
      buildTextCell(formatRunTimestamp(run.created)),
      buildNumericCell(String(run.total_score)),
      buildBadgeCell(run.policy ? "Attached" : "Missing", run.policy ? "success" : "neutral"),
    );
    fragment.appendChild(row);
  }
  replaceChildren(els.runsTable, fragment);
}

function renderJobs(jobs) {
  if (!jobs.length) {
    replaceChildren(els.jobsTable, buildEmptyRow(5, "No jobs queued yet."));
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const job of jobs.slice(0, 12)) {
    const row = document.createElement("tr");
    row.dataset.jobId = job.id;
    row.className = `selectable-row${job.id === state.selectedJobId ? " is-selected" : ""}`;
    row.append(
      buildJobCell(job),
      buildTextCell(job.action),
      buildStatusCell(job.status),
      buildTextCell(inferJobTarget(job)),
      buildTextCell(formatRunTimestamp(job.created_at)),
    );
    fragment.appendChild(row);
  }
  replaceChildren(els.jobsTable, fragment);
}

function renderJobDetail(job) {
  if (!job) {
    els.jobDetailStatus.textContent = "Waiting";
    replaceChildren(
      els.jobDetail,
      createParagraph("empty-copy", "Select a job to inspect the exact request and result."),
    );
    return;
  }

  els.jobDetailStatus.textContent = job.status;
  const root = document.createDocumentFragment();

  root.append(
    buildDefinitionList([
      ["Job id", job.id],
      ["Action", job.action],
      ["Target", inferJobTarget(job)],
      ["Command", job.command_preview || "Unavailable"],
      ["Created", formatRunTimestamp(job.created_at)],
      ["Started", job.started_at ? formatRunTimestamp(job.started_at) : "Pending"],
      ["Finished", job.finished_at ? formatRunTimestamp(job.finished_at) : "Pending"],
    ]),
    buildSection(
      "Request",
      renderJsonPreview(job.request ?? {}),
      "Exact payload sent to the server.",
    ),
    buildSection(
      "Result",
      renderJsonPreview(job.result ?? {}),
      job.result ? "Job output and saved run linkage." : "No result yet.",
    ),
  );

  if (job.error) {
    root.append(
      buildSection("Error", createCodeBlock(job.error), "Failure output is preserved locally."),
    );
  }

  if (Array.isArray(job.events) && job.events.length > 0) {
    root.append(
      buildSection(
        "Events",
        createCodeBlock(
          job.events
            .map((event) => `${event.at} [${event.level}] ${event.message}`)
            .join("\n"),
        ),
        "Lifecycle events captured for local audit.",
      ),
    );
  }

  if (job.result?.run_id) {
    root.appendChild(
      buildSection(
        "Follow-up",
        createActionRow(job.result.run_id),
        "Rerun the saved configuration or open the run detail.",
      ),
    );
  }

  replaceChildren(els.jobDetail, root);
}

function renderAudit(audit) {
  if (!audit.length) {
    replaceChildren(
      els.auditFeed,
      createParagraph("empty-copy", "No audit events yet."),
    );
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const entry of audit.slice(0, 12)) {
    const item = document.createElement("article");
    item.className = "feed-item";

    const header = document.createElement("div");
    header.className = "feed-item-header";

    const action = document.createElement("span");
    action.className = "feed-item-title";
    action.textContent = entry.action;

    const status = createStatusPill(entry.status);
    header.append(action, status);

    const body = document.createElement("div");
    body.className = "feed-item-body";
    body.append(
      createFeedLine("Target", entry.target),
      createFeedLine("Actor", entry.actor),
      createFeedLine("Time", formatRunTimestamp(entry.created_at)),
      createFeedLine("Job", entry.job_id ?? "n/a"),
    );

    if (entry.message) {
      const message = document.createElement("p");
      message.className = "feed-message";
      message.textContent = entry.message;
      body.appendChild(message);
    }

    item.append(header, body);
    fragment.appendChild(item);
  }
  replaceChildren(els.auditFeed, fragment);
}

async function submitJob(payload, resultNode) {
  if (!payload) {
    return;
  }

  const pendingMessage = document.createElement("span");
  pendingMessage.textContent = "Submitting...";
  replaceChildren(resultNode, pendingMessage);

  try {
    const response = await fetch("/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const error = await readError(response);
      throw new Error(error);
    }
    const payloadJson = await response.json();
    const job = payloadJson.job;
    setBanner(`Queued ${job.action} job ${job.id}.`);
    replaceChildren(resultNode, createStatusNote(`Queued job ${job.id}`));
    await refreshDashboard({ silent: true });
    if (job?.id) {
      selectJob(job.id);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job submission failed";
    replaceChildren(resultNode, createStatusNote(message, "error"));
    setBanner(message);
  }
}

function buildScanJob(form) {
  const formData = new FormData(form);
  const payload = {
    action: "scan",
    target: requiredValue(formData, "target"),
    diff_base: optionalValue(formData, "diff_base"),
    rules_dir: optionalValue(formData, "rules_dir"),
    policy_path: optionalValue(formData, "policy_path"),
    threshold: optionalNumber(formData, "threshold"),
    max_findings: optionalInteger(formData, "max_findings"),
    show: requiredValue(formData, "show") || "all",
    show_evidence: formData.get("show_evidence") === "on",
    save_run: formData.get("save_run") === "on",
  };
  return cleanPayload(payload);
}

function buildPolicyJob(form) {
  const formData = new FormData(form);
  const payload = {
    action: "policy-generate",
    target: requiredValue(formData, "target"),
    merge: optionalValue(formData, "merge"),
    rules_dir: optionalValue(formData, "rules_dir"),
    save_run: formData.get("save_run") === "on",
  };
  return cleanPayload(payload);
}

function buildSignJob(form) {
  const formData = new FormData(form);
  const payload = {
    action: "sign",
    artifact: requiredValue(formData, "artifact"),
    key: requiredValue(formData, "key"),
    out: optionalValue(formData, "out"),
    confirm: formData.get("confirm_local") === "on",
  };
  return cleanPayload(payload);
}

function buildVerifyJob(form) {
  const formData = new FormData(form);
  const payload = {
    action: "verify",
    artifact: requiredValue(formData, "artifact"),
    pub: requiredValue(formData, "pub"),
    signature: optionalValue(formData, "signature"),
    strict: formData.get("strict") === "on",
    confirm: formData.get("confirm_local") === "on",
  };
  return cleanPayload(payload);
}

function cleanPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== ""),
  );
}

function requiredValue(formData, key) {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required field: ${key}`);
  }
  return value.trim();
}

function optionalValue(formData, key) {
  const value = formData.get(key);
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalNumber(formData, key) {
  const value = optionalValue(formData, key);
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalInteger(formData, key) {
  const value = optionalValue(formData, key);
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function resultNodeFor(form) {
  if (form === els.scanForm) {
    return els.scanResult;
  }
  if (form === els.policyForm) {
    return els.policyResult;
  }
  if (form === els.signForm) {
    return els.signResult;
  }
  return els.verifyResult;
}

function selectJob(jobId) {
  state.selectedJobId = jobId;
  renderJobs(state.overview?.jobs ?? []);
  renderJobDetail(state.jobsById.get(jobId) ?? null);
}

function updateRefreshStamp() {
  if (!els.dashboardRefresh) {
    return;
  }
  els.dashboardRefresh.textContent = `Updated ${formatTimestamp(new Date())}`;
}

function updateBannerForJobs(activeJobs) {
  if (!els.dashboardStatus) {
    return;
  }
  if (activeJobs.length > 0) {
    els.dashboardStatus.textContent = `${activeJobs.length} job(s) running locally`;
    return;
  }
  els.dashboardStatus.textContent =
    "Jobs stay local to this machine and are written to the dashboard history.";
}

function setBanner(text) {
  if (els.dashboardStatus) {
    els.dashboardStatus.textContent = text;
  }
}

function createStatusNote(text, tone = "neutral") {
  const span = document.createElement("span");
  span.className = `status-note status-note-${tone}`;
  span.textContent = text;
  return span;
}

function createStatusPill(status) {
  const tone = statusTone(status);
  const span = document.createElement("span");
  span.className = `status-pill ${tone}`;
  span.textContent = status;
  return span;
}

function statusTone(status) {
  switch (String(status).toLowerCase()) {
    case "running":
      return "status-pill-warning";
    case "succeeded":
    case "success":
      return "status-pill-success";
    case "failed":
      return "status-pill-danger";
    case "queued":
      return "status-pill-neutral";
    default:
      return "status-pill-neutral";
  }
}

function buildTargetCell(target) {
  const cell = document.createElement("td");
  const title = document.createElement("div");
  title.className = "stack-title";
  title.textContent = target.label;
  const meta = document.createElement("div");
  meta.className = "stack-meta";
  meta.textContent = `${target.kind} · ${target.path}`;
  cell.append(title, meta);
  return cell;
}

function buildTargetRunCell(target, runs) {
  const cell = document.createElement("td");
  const run = target.last_run_id
    ? runs.find((entry) => entry.id === target.last_run_id)
    : null;
  cell.textContent = run ? `${run.id} (${run.total_score})` : target.last_run_id ?? "—";
  return cell;
}

function buildJobCell(job) {
  const cell = document.createElement("td");
  const title = document.createElement("div");
  title.className = "stack-title";
  title.textContent = job.id;
  const meta = document.createElement("div");
  meta.className = "stack-meta";
  meta.textContent = job.result?.run_id
    ? `run ${job.result.run_id}`
    : job.error
      ? "failed"
      : "queued";
  cell.append(title, meta);
  return cell;
}

function buildRunCell(run) {
  const cell = document.createElement("td");
  const stack = document.createElement("div");
  const link = document.createElement("a");
  link.className = "run-link";
  link.href = `/run.html?id=${encodeURIComponent(run.id)}`;
  link.textContent = run.id;
  link.title = run.id;
  stack.appendChild(link);

  const actions = document.createElement("div");
  actions.className = "stack-actions";
  const rerun = document.createElement("button");
  rerun.type = "button";
  rerun.className = "button-secondary";
  rerun.textContent = "Rerun";
  rerun.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await submitJob(
      {
        action: "rerun",
        run_id: run.id,
        save_run: true,
      },
      els.scanResult,
    );
  });
  actions.appendChild(rerun);
  stack.appendChild(actions);
  cell.appendChild(stack);
  return cell;
}

function buildTextCell(text) {
  const cell = document.createElement("td");
  cell.textContent = text;
  return cell;
}

function buildNumericCell(text) {
  const cell = document.createElement("td");
  cell.className = "align-right";
  cell.textContent = text;
  return cell;
}

function buildBadgeCell(text, tone) {
  const cell = document.createElement("td");
  cell.appendChild(createBadge(text, tone));
  return cell;
}

function buildStatusCell(status) {
  const cell = document.createElement("td");
  cell.appendChild(createStatusPill(status));
  return cell;
}

function createBadge(text, tone) {
  const badge = document.createElement("span");
  badge.className = `badge badge-${tone}`;
  badge.textContent = text;
  return badge;
}

function buildDefinitionList(entries) {
  const list = document.createElement("dl");
  list.className = "detail-list";
  for (const [label, value] of entries) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    list.append(dt, dd);
  }
  return list;
}

function buildSection(title, content, metaText) {
  const section = document.createElement("section");
  section.className = "detail-card";

  const header = document.createElement("div");
  header.className = "panel-header";

  const heading = document.createElement("div");
  const kicker = document.createElement("p");
  kicker.className = "panel-kicker";
  kicker.textContent = title;
  const h = document.createElement("h3");
  h.textContent = title;
  heading.append(kicker, h);

  header.append(heading);
  section.append(header, content);

  if (metaText) {
    const meta = document.createElement("p");
    meta.className = "panel-copy";
    meta.textContent = metaText;
    section.appendChild(meta);
  }

  return section;
}

function renderJsonPreview(value) {
  return createCodeBlock(JSON.stringify(value, null, 2));
}

function createCodeBlock(text) {
  const pre = document.createElement("pre");
  pre.className = "code-block";
  pre.textContent = text;
  return pre;
}

function createParagraph(className, text) {
  const node = document.createElement("p");
  node.className = className;
  node.textContent = text;
  return node;
}

function createFeedLine(label, value) {
  const line = document.createElement("div");
  line.className = "feed-line";
  const key = document.createElement("span");
  key.className = "feed-line-label";
  key.textContent = label;
  const content = document.createElement("span");
  content.className = "feed-line-value";
  content.textContent = value;
  line.append(key, content);
  return line;
}

function createActionRow(runId) {
  const row = document.createElement("div");
  row.className = "submit-row";

  const openLink = document.createElement("a");
  openLink.className = "button-secondary";
  openLink.href = `/run.html?id=${encodeURIComponent(runId)}`;
  openLink.textContent = "Open run";

  const rerun = document.createElement("button");
  rerun.type = "button";
  rerun.className = "button-secondary";
  rerun.textContent = "Rerun";
  rerun.addEventListener("click", async () => {
    await submitJob(
      {
        action: "rerun",
        run_id: runId,
        save_run: true,
      },
      els.scanResult,
    );
  });

  row.append(openLink, rerun);
  return row;
}

function inferJobTarget(job) {
  const request = job.request;
  if (request && typeof request === "object") {
    if (typeof request.run_id === "string") {
      return `Run ${request.run_id}`;
    }
    if (typeof request.target === "string") {
      return request.target;
    }
    if (typeof request.artifact === "string") {
      return request.artifact;
    }
  }
  return "Local";
}

function inferAuditTarget(entry, jobs) {
  if (entry.job_id) {
    const job = jobs.find((candidate) => candidate.id === String(entry.job_id));
    if (job) {
      return inferJobTarget(job);
    }
  }
  if (entry.request && typeof entry.request === "object") {
    if (typeof entry.request.target === "string") {
      return entry.request.target;
    }
    if (typeof entry.request.artifact === "string") {
      return entry.request.artifact;
    }
    if (typeof entry.request.run_id === "string") {
      return `Run ${entry.request.run_id}`;
    }
  }
  return null;
}

function isActiveJob(job) {
  return job.status === "queued" || job.status === "running";
}

function inferSourceKind(pathname) {
  const value = String(pathname || "").toLowerCase();
  if (!value) {
    return "unknown";
  }
  if (value.includes(".github/workflows")) {
    return "workflow";
  }
  if (
    value.startsWith("readme") ||
    value.startsWith("guide") ||
    value.includes("/docs/") ||
    value.endsWith(".md")
  ) {
    return "docs";
  }
  if (
    value.includes("/tests/") ||
    value.includes("/test/") ||
    value.endsWith(".test.ts") ||
    value.endsWith(".spec.ts")
  ) {
    return "tests";
  }
  if (value.endsWith(".yml") || value.endsWith(".yaml") || value.includes("config")) {
    return "config";
  }
  if (value.startsWith("src/")) {
    return "source";
  }
  return "other";
}

function formatTargetLabel(value) {
  const text = String(value);
  if (text.length <= 72) {
    return text;
  }
  return `${text.slice(0, 69)}...`;
}

function formatRiskLabel(level) {
  if (!level) {
    return "No data";
  }

  return level
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatRunTimestamp(value) {
  const text = String(value ?? "");
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})(\d{2})Z(?:-\d+)?$/.exec(text);
  if (!match) {
    return text || "—";
  }

  const [, date, hour, minute, second] = match;
  return `${date} ${hour}:${minute}:${second} UTC`;
}

function formatTimestamp(date) {
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildEmptyRow(columns, message) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = columns;
  cell.className = "empty-cell";
  cell.textContent = message;
  row.appendChild(cell);
  return row;
}

function replaceChildren(node, content) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
  node.appendChild(content);
}

async function fetchJson(path) {
  try {
    const response = await fetch(path);
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  }
}

async function readError(response) {
  try {
    const payload = await response.json();
    return typeof payload?.error === "string" ? payload.error : "Request failed";
  } catch {
    return "Request failed";
  }
}

void init();
