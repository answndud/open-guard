const runTitle = document.getElementById("run-title");
const runSubtitle = document.getElementById("run-subtitle");
const runScore = document.getElementById("run-score");
const runRisk = document.getElementById("run-risk");
const findingsMeta = document.getElementById("run-findings-meta");
const findingsTable = document.getElementById("run-findings-table");

function getRunId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    return null;
  }
  return response.json();
}

async function init() {
  const runId = getRunId();
  if (!runId) {
    runSubtitle.textContent = "Missing run id.";
    return;
  }

  const report = await fetchJson(`/api/runs/${runId}`);
  if (!report) {
    runSubtitle.textContent = "Run not found.";
    return;
  }

  runTitle.textContent = `Run ${runId}`;
  runSubtitle.textContent = report.target.resolved_path || report.target.input;
  runScore.textContent = report.summary.total_score;
  runRisk.textContent = report.summary.risk_level.replace("-", " ");
  findingsMeta.textContent = `${report.summary.counts.total} findings`;
  renderFindings(report.findings || []);
}

function renderFindings(findings) {
  findingsTable.innerHTML = "";
  if (findings.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="5" class="empty">No findings yet.</td>';
    findingsTable.appendChild(row);
    return;
  }
  findings.forEach((finding) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${finding.id}</td>
      <td>${finding.severity}</td>
      <td>${finding.rule_id}</td>
      <td>${finding.evidence.path}</td>
      <td>${finding.evidence.start_line}</td>
    `;
    findingsTable.appendChild(row);
  });
}

void init();
