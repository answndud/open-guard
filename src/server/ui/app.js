const summaryScore = document.getElementById("summary-score");
const summaryRisk = document.getElementById("summary-risk");
const trendMeta = document.getElementById("trend-meta");
const trendChart = document.getElementById("trend-chart");
const findingsList = document.getElementById("findings-list");
const findingsMeta = document.getElementById("findings-meta");
const runsMeta = document.getElementById("runs-meta");
const runsTable = document.getElementById("runs-table");

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    return null;
  }
  return response.json();
}

async function init() {
  const runs = await fetchJson("/api/runs");
  if (!runs || !runs.runs || runs.runs.length === 0) {
    renderEmpty();
    return;
  }

  runsMeta.textContent = `${runs.runs.length} saved runs`;
  renderRuns(runs.runs);
  renderTrend(runs.runs);

  const summary = await fetchJson("/api/summary");
  if (summary) {
    summaryScore.textContent = summary.summary.total_score;
    summaryRisk.textContent = summary.summary.risk_level.replace("-", " ");
    findingsMeta.textContent = `${summary.summary.counts.total} findings`;
    renderFindings(summary);
  }
}

function renderEmpty() {
  trendMeta.textContent = "No runs yet";
  findingsMeta.textContent = "0 findings";
  runsMeta.textContent = "No saved runs";
  summaryScore.textContent = "--";
  summaryRisk.textContent = "No data";
}

function renderRuns(runs) {
  runsTable.innerHTML = "";
  runs.slice(0, 10).forEach((run) => {
    const row = document.createElement("tr");
    const link = `/run.html?id=${encodeURIComponent(run.id)}`;
    row.innerHTML = `
      <td><a href="${link}">${run.id}</a></td>
      <td>${run.total_score}</td>
      <td>${run.policy ? "attached" : "-"}</td>
    `;
    runsTable.appendChild(row);
  });
}

function renderFindings(summary) {
  const findings = summary.summary.counts;
  const items = [
    { label: "Critical", value: findings.critical, tone: "critical" },
    { label: "High", value: findings.high, tone: "high" },
    { label: "Medium", value: findings.medium, tone: "low" },
    { label: "Low", value: findings.low, tone: "low" },
  ];
  findingsList.innerHTML = items
    .map(
      (item) => `
      <div class="badge ${item.tone}">
        ${item.label}: ${item.value}
      </div>
    `,
    )
    .join("");
}

function renderTrend(runs) {
  const scores = runs
    .slice(0, 12)
    .map((run) => run.total_score)
    .reverse();
  if (scores.length === 0) {
    trendMeta.textContent = "No runs yet";
    return;
  }
  trendMeta.textContent = `Last ${scores.length} runs`;
  const width = 300;
  const height = 120;
  const max = Math.max(...scores, 100);
  const min = 0;
  const step = scores.length > 1 ? width / (scores.length - 1) : width;
  const points = scores
    .map((score, index) => {
      const x = index * step;
      const y = height - ((score - min) / (max - min)) * height;
      return `${x},${y}`;
    })
    .join(" ");
  trendChart.innerHTML = `
    <polyline
      fill="none"
      stroke="rgba(54, 194, 180, 0.35)"
      stroke-width="6"
      points="${points}"
    />
    <polyline
      fill="none"
      stroke="#36c2b4"
      stroke-width="2"
      points="${points}"
    />
  `;
}

void init();
