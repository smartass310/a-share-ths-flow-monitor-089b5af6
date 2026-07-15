const DATA_URL = "data/site-data.json";
const state = { data: null, chartView: "netFlow", tableFilter: "all", tableDataset: "industry" };

function formatNumber(value, digits) {
  digits = digits ?? 1;
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  const n = Number(value);
  const abs = Math.abs(n);
  if (abs >= 100000000) return (n / 100000000).toFixed(digits) + "亿";
  if (abs >= 10000) return (n / 10000).toFixed(digits) + "万";
  return n.toFixed(digits);
}
function formatPct(value, digits) {
  digits = digits ?? 2;
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return Number(value).toFixed(digits) + "%";
}
function signedClass(value) {
  if (Number(value) > 0) return "positive-text";
  if (Number(value) < 0) return "negative-text";
  return "muted-text";
}
const metricConfig = {
  netFlow: { label: "净流入", formatter: function(v){ return formatNumber(v); }, key: "netFlow" },
  flowRate: { label: "净流入率", formatter: function(v){ return formatPct(v); }, key: "flowRate" },
  changePct: { label: "涨跌幅", formatter: function(v){ return formatPct(v); }, key: "changePct" }
};

async function loadData() {
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    state.data = await response.json();
  } catch (error) {
    state.data = createFallbackData(error);
  }
  normalizeShape();
  render();
}
function createFallbackData(error) {
  return { meta: { tradingDay: "--", generatedAt: "--", dataWarning: "未能读取 data/site-data.json：" + error.message, fundFlowCoverage: { statusText: "等待数据" } }, industries: [], concepts: [], stocks: [], signals: [], report: { title: "等待首次数据生成", paragraphs: ["站点结构已经就绪。自动更新脚本成功运行后，这里会显示每日复盘内容。"], bullets: [] } };
}
function normalizeShape() {
  if (!state.data.industries) state.data.industries = state.data.level1 || [];
  if (!state.data.concepts) state.data.concepts = state.data.level2 || [];
  if (!state.data.stocks) state.data.stocks = [];
}
function render() {
  renderMeta(); renderSummary(); renderIndustryChart(); renderConceptHeatmap(); renderSignals(); renderReport(); renderTable(); bindControls();
}
function renderMeta() {
  const meta = state.data.meta || {};
  document.querySelector("#trading-day").textContent = meta.tradingDay || "--";
  document.querySelector("#generated-at").textContent = meta.generatedAt || "--";
  document.querySelector("#coverage-status").textContent = (meta.fundFlowCoverage && meta.fundFlowCoverage.statusText) || meta.dataMode || "--";
  const alert = document.querySelector("#data-alert");
  const warning = meta.dataWarning || meta.coverageNote;
  if (warning) { alert.hidden = false; alert.textContent = warning; } else { alert.hidden = true; }
}
function renderSummary() {
  const industries = state.data.industries || [];
  const concepts = state.data.concepts || [];
  const stocks = state.data.stocks || [];
  const positive = industries.filter(function(item){ return Number(item.netFlow) > 0; }).length;
  const negative = industries.filter(function(item){ return Number(item.netFlow) < 0; }).length;
  const topConcept = concepts.slice().sort(function(a,b){ return Number(b.netFlow) - Number(a.netFlow); })[0];
  const topStock = stocks.slice().sort(function(a,b){ return Number(b.netFlow) - Number(a.netFlow); })[0];
  document.querySelector("#level1-positive").textContent = positive ? positive + " 个" : "--";
  document.querySelector("#level1-negative").textContent = negative ? negative + " 个" : "--";
  document.querySelector("#top-l2-name").textContent = topConcept ? topConcept.name : "--";
  document.querySelector("#top-l2-note").textContent = topConcept ? formatNumber(topConcept.netFlow) + " · " + formatPct(topConcept.flowRate) : "--";
  document.querySelector("#signal-count").textContent = topStock ? topStock.name : "--";
  const stockNote = document.querySelector(".accent-cyan small");
  if (stockNote) stockNote.textContent = topStock ? formatNumber(topStock.netFlow) + " · " + formatPct(topStock.changePct) : "当日净流入居前";
}
function renderIndustryChart() {
  const container = document.querySelector("#level1-chart");
  const config = metricConfig[state.chartView];
  const rows = (state.data.industries || []).slice().sort(function(a,b){ return Number(b[config.key] || 0) - Number(a[config.key] || 0); }).slice(0, 18);
  const maxAbs = Math.max.apply(null, rows.map(function(item){ return Math.abs(Number(item[config.key] || 0)); }).concat([1]));
  container.innerHTML = rows.map(function(item){
    const value = Number(item[config.key] || 0);
    const width = Math.max(Math.abs(value) / maxAbs * 50, value === 0 ? 0 : 2);
    const direction = value >= 0 ? "positive" : "negative";
    return '<div class="bar-row" title="' + item.name + '：' + config.formatter(value) + '"><div class="bar-name">' + item.name + '</div><div class="bar-track"><div class="bar-fill ' + direction + '" style="width:' + width + '%"></div></div><div class="bar-value ' + signedClass(value) + '">' + config.formatter(value) + '</div></div>';
  }).join("");
}
function renderConceptHeatmap() {
  const container = document.querySelector("#level2-heatmap");
  const rows = (state.data.concepts || []).slice().sort(function(a,b){ return Math.abs(Number(b.netFlow || 0)) - Math.abs(Number(a.netFlow || 0)); }).slice(0, 12);
  const maxAbs = Math.max.apply(null, rows.map(function(item){ return Math.abs(Number(item.netFlow || 0)); }).concat([1]));
  container.innerHTML = rows.map(function(item){
    const value = Number(item.netFlow || 0);
    const strength = Math.min(Math.abs(value) / maxAbs, 1);
    const color = value >= 0 ? "rgba(69, 196, 134, " + (0.18 + strength * 0.42) + ")" : "rgba(230, 107, 97, " + (0.18 + strength * 0.42) + ")";
    return '<div class="heat-cell" style="background:' + color + '"><strong>' + item.name + '</strong><span>' + formatNumber(item.netFlow) + ' · ' + formatPct(item.changePct) + '</span></div>';
  }).join("");
}
function renderSignals() {
  const container = document.querySelector("#streak-list");
  const signals = state.data.signals || [];
  container.innerHTML = signals.slice(0, 6).map(function(item){
    const kind = item.type === "转弱" || item.type === "流出" ? "bad" : item.type === "分歧" || item.type === "背离" ? "neutral" : "good";
    return '<div class="signal-item"><div><strong>' + item.name + '</strong><small>' + item.description + '</small></div><span class="badge ' + kind + '">' + item.type + '</span></div>';
  }).join("");
}
function renderReport() {
  const report = state.data.report || {};
  document.querySelector("#report-title").textContent = report.title || "站内小报告";
  const paragraphs = (report.paragraphs || []).map(function(text){ return '<p>' + text + '</p>'; }).join("");
  const bullets = (report.bullets || []).length ? '<ul>' + report.bullets.map(function(text){ return '<li>' + text + '</li>'; }).join("") + '</ul>' : "";
  document.querySelector("#report-body").innerHTML = paragraphs + bullets;
}
function currentRows() {
  const source = state.tableDataset === "concept" ? state.data.concepts : state.tableDataset === "stock" ? state.data.stocks : state.data.industries;
  let rows = (source || []).slice().sort(function(a,b){ return Number(b.netFlow || 0) - Number(a.netFlow || 0); });
  if (state.tableFilter === "inflow") rows = rows.filter(function(item){ return Number(item.netFlow) > 0; });
  if (state.tableFilter === "outflow") rows = rows.filter(function(item){ return Number(item.netFlow) < 0; });
  return rows;
}
function renderTable() {
  const tbody = document.querySelector("#level2-table");
  const rows = currentRows();
  tbody.innerHTML = rows.slice(0, state.tableDataset === "stock" ? 80 : 120).map(function(item, index){
    const status = item.status || (Number(item.netFlow) > 0 ? "流入" : "流出");
    const badgeKind = status.indexOf("流出") >= 0 || status.indexOf("转弱") >= 0 ? "bad" : status.indexOf("分歧") >= 0 || status.indexOf("背离") >= 0 ? "neutral" : "good";
    const typeText = item.code || item.category || item.kind || (state.tableDataset === "concept" ? "概念" : state.tableDataset === "stock" ? "个股" : "行业");
    const note = item.note || item.leader || item.turnoverRate || "--";
    return '<tr><td>' + (index + 1) + '</td><td>' + item.name + '</td><td>' + typeText + '</td><td class="' + signedClass(item.netFlow) + '">' + formatNumber(item.netFlow) + '</td><td class="' + signedClass(item.flowRate) + '">' + formatPct(item.flowRate) + '</td><td class="' + signedClass(item.changePct) + '">' + formatPct(item.changePct) + '</td><td>' + note + '</td><td><span class="badge ' + badgeKind + '">' + status + '</span></td></tr>';
  }).join("");
}
function bindControls() {
  document.querySelectorAll("[data-view]").forEach(function(button){ button.onclick = function(){ state.chartView = button.dataset.view; document.querySelectorAll("[data-view]").forEach(function(item){ item.classList.toggle("active", item === button); }); renderIndustryChart(); }; });
  document.querySelectorAll("[data-table-filter]").forEach(function(button){ button.onclick = function(){ state.tableFilter = button.dataset.tableFilter; document.querySelectorAll("[data-table-filter]").forEach(function(item){ item.classList.toggle("active", item === button); }); renderTable(); }; });
  document.querySelectorAll("[data-table-dataset]").forEach(function(button){ button.onclick = function(){ state.tableDataset = button.dataset.tableDataset; document.querySelectorAll("[data-table-dataset]").forEach(function(item){ item.classList.toggle("active", item === button); }); renderTable(); }; });
}
loadData();
