const state = {
  report: null,
  policyYaml: "",
  selectedIndex: 0,
  activeView: "finding",
};

const els = {
  runTitle: document.getElementById("run-title"),
  runSubtitle: document.getElementById("run-subtitle"),
  runScore: document.getElementById("run-score"),
  runRisk: document.getElementById("run-risk"),
  runFindingsTotal: document.getElementById("run-findings-total"),
  runTargetLabel: document.getElementById("run-target-label"),
  runFindingsMeta: document.getElementById("run-findings-meta"),
  runTableMeta: document.getElementById("run-table-meta"),
  runPolicyMeta: document.getElementById("run-policy-meta"),
  runScanMeta: document.getElementById("run-scan-meta"),
  runRerunButton: document.getElementById("run-rerun-button"),
  findingList: document.getElementById("finding-list"),
  detailTitle: document.getElementById("detail-title"),
  detailMeta: document.getElementById("detail-meta"),
  findingMeta: document.getElementById("finding-meta"),
  findingDescription: document.getElementById("finding-description"),
  findingRemediation: document.getElementById("finding-remediation"),
  findingSnippetMeta: document.getElementById("finding-snippet-meta"),
  findingSnippet: document.getElementById("finding-snippet"),
  findingTags: document.getElementById("finding-tags"),
  policyStatus: document.getElementById("policy-status"),
  policyView: document.getElementById("policy-view"),
  rawStatus: document.getElementById("raw-status"),
  rawView: document.getElementById("raw-view"),
  tabButtons: Array.from(document.querySelectorAll(".tab-button")),
  tabPanels: Array.from(document.querySelectorAll(".tab-panel")),
};

async function init() {
  if (!els.runTitle || !els.findingList) {
    return;
  }

  bindTabs();
  bindActions();
  await loadRun();
}

function bindTabs() {
  for (const button of els.tabButtons) {
    button.addEventListener("click", () => {
      const view = button.dataset.view;
      if (view) {
        setActiveView(view);
      }
    });
  }
}

function bindActions() {
  if (!els.runRerunButton) {
    return;
  }
  els.runRerunButton.addEventListener("click", async () => {
    const runId = getRunId();
    if (!runId) {
      return;
    }
    els.runPolicyMeta.textContent = "Submitting rerun...";
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "rerun",
          run_id: runId,
          save_run: true,
        }),
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      const payload = await response.json();
      els.runPolicyMeta.textContent = `Queued rerun job ${payload.job.id}`;
    } catch (error) {
      els.runPolicyMeta.textContent =
        error instanceof Error ? error.message : "Failed to queue rerun";
    }
  });
}

async function loadRun() {
  const runId = getRunId();
  if (!runId) {
    renderMissingRun("Missing run id.");
    return;
  }

  const [report, policyYaml] = await Promise.all([
    fetchJson(`/api/runs/${runId}`),
    fetchPolicyText(runId),
  ]);

  if (!report) {
    renderMissingRun("Run not found.");
    return;
  }

  state.report = report;
  state.policyYaml = policyYaml ?? "";
  state.selectedIndex = 0;

  renderHeader(runId, report);
  renderFindings(report.findings ?? []);
  renderPolicy();
  renderRaw();
  renderSelectedFinding();
  setActiveView("finding");
}

function renderHeader(runId, report) {
  els.runTitle.textContent = `Run ${runId}`;
  els.runSubtitle.textContent = formatTargetLabel(
    report.target?.resolved_path ?? report.target?.input ?? "Unknown target",
  );
  els.runTargetLabel.textContent = formatTargetLabel(
    report.target?.resolved_path ?? report.target?.input ?? "Unknown target",
  );
  els.runScore.textContent = String(report.summary?.total_score ?? "--");
  els.runRisk.textContent = formatRiskLabel(report.summary?.risk_level);
  els.runFindingsTotal.textContent = String(report.summary?.counts?.total ?? 0);
  els.runFindingsMeta.textContent = `${report.summary?.counts?.total ?? 0} findings`;
  els.runTableMeta.textContent =
    report.findings && report.findings.length > 0
      ? "Select a finding to inspect"
      : "No findings captured";
  els.runPolicyMeta.textContent = report.recommended_policy ? "Policy available" : "Policy missing";
  els.runScanMeta.textContent = renderScanMeta(report);
}

function renderFindings(findings) {
  if (findings.length === 0) {
    replaceChildren(els.findingList, buildEmptyMessage("No findings in this run."));
    return;
  }

  const fragment = document.createDocumentFragment();
  findings.forEach((finding, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `finding-item${index === state.selectedIndex ? " is-selected" : ""}`;
    button.dataset.index = String(index);

    const top = document.createElement("div");
    top.className = "finding-item-top";

    const title = document.createElement("div");
    title.className = "stack-title";
    title.textContent = finding.title;

    const severity = createBadge(formatSeverity(finding.severity), finding.severity);
    top.append(title, severity);

    const meta = document.createElement("div");
    meta.className = "stack-meta";
    meta.textContent = `${finding.rule_id} · ${finding.evidence.path}`;

    const line = document.createElement("div");
    line.className = "finding-item-line";
    line.textContent = `Line ${finding.evidence.start_line} · ${inferSourceKind(finding.evidence.path)}`;

    button.append(top, meta, line);
    button.addEventListener("click", () => {
      state.selectedIndex = index;
      renderFindings(findings);
      renderSelectedFinding();
    });
    fragment.appendChild(button);
  });

  replaceChildren(els.findingList, fragment);
}

function renderSelectedFinding() {
  const finding = currentFinding();
  if (!finding) {
    els.detailTitle.textContent = "Finding detail";
    els.detailMeta.textContent = "No selection";
    replaceChildren(els.findingMeta, buildEmptyDefinition());
    els.findingDescription.textContent = "Select a finding to inspect it.";
    els.findingRemediation.textContent = "--";
    els.findingSnippetMeta.textContent = "--";
    els.findingSnippet.textContent = "--";
    replaceChildren(els.findingTags, buildEmptyChip());
    return;
  }

  els.detailTitle.textContent = finding.title;
  els.detailMeta.textContent = `${finding.rule_id} · ${inferSourceKind(finding.evidence.path)}`;
  replaceChildren(
    els.findingMeta,
    buildDefinitionList([
      ["Rule", finding.rule_id],
      ["Severity", formatSeverity(finding.severity)],
      ["Category", finding.category],
      ["Confidence", formatConfidence(finding.confidence)],
      ["Source kind", inferSourceKind(finding.evidence.path)],
      ["File", finding.evidence.path],
      ["Line", `${finding.evidence.start_line}`],
    ]),
  );
  els.findingDescription.textContent = finding.description || "No description available.";
  els.findingRemediation.textContent = finding.remediation || "No remediation provided.";
  els.findingSnippetMeta.textContent = `Context ${finding.evidence.context_start_line}-${finding.evidence.context_end_line} · Match line ${finding.evidence.start_line}`;
  els.findingSnippet.textContent = finding.evidence.snippet || finding.evidence.match || "--";
  renderTags(finding.tags ?? []);
}

function renderTags(tags) {
  if (!tags.length) {
    replaceChildren(els.findingTags, buildEmptyChip());
    return;
  }

  const fragment = document.createDocumentFragment();
  tags.forEach((tag) => {
    fragment.appendChild(createChip(tag));
  });
  replaceChildren(els.findingTags, fragment);
}

function renderPolicy() {
  if (!state.policyYaml) {
    els.policyStatus.textContent = "Policy not available for this run.";
    els.policyView.textContent = "No policy YAML found.";
    return;
  }
  els.policyStatus.textContent = "Policy loaded from the local server.";
  els.policyView.textContent = state.policyYaml;
}

function renderRaw() {
  if (!state.report) {
    els.rawStatus.textContent = "No report data.";
    els.rawView.textContent = "No report data.";
    return;
  }
  els.rawStatus.textContent = "Pretty-printed report JSON from the server.";
  els.rawView.textContent = JSON.stringify(state.report, null, 2);
}

function setActiveView(view) {
  state.activeView = view;
  for (const button of els.tabButtons) {
    const isActive = button.dataset.view === view;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  }
  for (const panel of els.tabPanels) {
    panel.classList.toggle("is-hidden", panel.dataset.panel !== view);
  }
}

function renderMissingRun(message) {
  els.runSubtitle.textContent = message;
  els.runScore.textContent = "--";
  els.runRisk.textContent = "--";
  els.runFindingsTotal.textContent = "--";
  els.runTargetLabel.textContent = "--";
  els.runFindingsMeta.textContent = message;
  els.runPolicyMeta.textContent = "Policy unavailable";
  els.runScanMeta.textContent = "--";
  replaceChildren(els.findingList, buildEmptyMessage(message));
  renderSelectedFinding();
  renderPolicy();
  renderRaw();
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

async function fetchPolicyText(runId) {
  try {
    const response = await fetch(`/api/policy/${runId}`);
    if (!response.ok) {
      return "";
    }
    return await response.text();
  } catch {
    return "";
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

function currentFinding() {
  const findings = state.report?.findings ?? [];
  return findings[state.selectedIndex] ?? null;
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

function buildEmptyDefinition() {
  const list = document.createElement("dl");
  list.className = "detail-list";
  const dt = document.createElement("dt");
  dt.textContent = "Finding";
  const dd = document.createElement("dd");
  dd.textContent = "No selection";
  list.append(dt, dd);
  return list;
}

function buildEmptyMessage(message) {
  const paragraph = document.createElement("p");
  paragraph.className = "empty-copy";
  paragraph.textContent = message;
  return paragraph;
}

function createChip(text) {
  const chip = document.createElement("span");
  chip.className = "chip";
  chip.textContent = text;
  return chip;
}

function buildEmptyChip() {
  const chip = document.createElement("span");
  chip.className = "empty-chip";
  chip.textContent = "No tags";
  return chip;
}

function createBadge(text, tone) {
  const badge = document.createElement("span");
  badge.className = `badge badge-${severityTone(tone)}`;
  badge.textContent = text;
  return badge;
}

function replaceChildren(node, content) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
  node.appendChild(content);
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

function renderScanMeta(report) {
  const meta = report.scan_metadata ?? {};
  const parts = [];
  if (meta.rules_loaded !== undefined) {
    parts.push(`${meta.rules_loaded} rules`);
  }
  if (meta.duration_ms !== undefined) {
    parts.push(`${meta.duration_ms} ms`);
  }
  return parts.length ? parts.join(" · ") : "No scan metadata";
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
    return "--";
  }
  return level
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatSeverity(severity) {
  if (!severity) {
    return "Unknown";
  }
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

function formatConfidence(confidence) {
  if (!confidence) {
    return "Unknown";
  }
  return confidence.charAt(0).toUpperCase() + confidence.slice(1);
}

function severityTone(severity) {
  switch (String(severity).toLowerCase()) {
    case "critical":
      return "critical";
    case "high":
      return "high";
    case "medium":
      return "medium";
    case "low":
      return "low";
    default:
      return "neutral";
  }
}

void init();
