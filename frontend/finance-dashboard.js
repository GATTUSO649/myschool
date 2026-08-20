(() => {
  const palette = { paid: '#0f766e', balance: '#d97706', billed: '#123347', grid: '#dbe7ea', text: '#526773', blue: '#2563eb' };
  let dashboardData = null;

  function money(value) { return `KSh ${Number(value || 0).toLocaleString()}`; }
  function canvasContext(id) {
    const canvas = document.getElementById(id);
    if (!canvas) return null;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 500;
    const height = canvas.clientHeight || 260;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { canvas, context, width, height };
  }
  function emptyChart(id, message) {
    const container = document.getElementById(id)?.parentElement;
    if (container) container.innerHTML = `<div class="finance-empty">${message}</div>`;
  }
  function drawGrid(context, width, height, left, right, top, bottom, steps = 4) {
    context.strokeStyle = palette.grid;
    context.lineWidth = 1;
    context.font = '11px system-ui, sans-serif';
    context.fillStyle = palette.text;
    for (let index = 0; index <= steps; index += 1) {
      const y = top + ((height - top - bottom) / steps) * index;
      context.beginPath(); context.moveTo(left, y); context.lineTo(width - right, y); context.stroke();
    }
  }
  function drawCollections(data) {
    const chart = canvasContext('financeCollectionsCanvas');
    if (!chart) return;
    const { context, width, height } = chart;
    const forms = data.forms || [];
    const paid = forms.map((form) => Number(data.paid?.[form] || 0));
    const outstanding = forms.map((form) => Math.max(Number(data.outstanding?.[form] || 0), 0));
    const max = Math.max(...forms.map((form, index) => paid[index] + outstanding[index]), 1);
    const left = 48; const right = 18; const top = 18; const bottom = 34;
    drawGrid(context, width, height, left, right, top, bottom);
    const slot = (width - left - right) / Math.max(forms.length, 1);
    const barWidth = Math.min(74, slot * .56);
    forms.forEach((form, index) => {
      const x = left + slot * index + (slot - barWidth) / 2;
      const paidHeight = (paid[index] / max) * (height - top - bottom);
      const outstandingHeight = (outstanding[index] / max) * (height - top - bottom);
      const baseline = height - bottom;
      context.fillStyle = palette.balance; context.fillRect(x, baseline - outstandingHeight, barWidth, outstandingHeight);
      context.fillStyle = palette.paid; context.fillRect(x, baseline - outstandingHeight - paidHeight, barWidth, paidHeight);
      context.fillStyle = palette.text; context.textAlign = 'center'; context.fillText(form.replace('Form ', 'F'), x + barWidth / 2, height - 12);
      context.fillStyle = palette.billed; context.font = 'bold 10px system-ui, sans-serif'; context.fillText(money(paid[index] + outstanding[index]).replace('KSh ', ''), x + barWidth / 2, baseline - outstandingHeight - paidHeight - 8);
      context.font = '11px system-ui, sans-serif';
    });
  }
  function drawRate(data) {
    const chart = canvasContext('financeRateCanvas');
    if (!chart) return;
    const { context, width, height } = chart;
    const billed = Number(data.total_charged || data.total_charges || data.billed || 0);
    const paid = Number(data.total_paid || data.paid || 0);
    const rate = billed ? Math.min(100, Math.round((paid / billed) * 100)) : 0;
    const centerX = width / 2; const centerY = height / 2 + 8; const radius = Math.min(width, height) * .3;
    context.lineWidth = 24; context.lineCap = 'round'; context.strokeStyle = '#e4eeee'; context.beginPath(); context.arc(centerX, centerY, radius, -Math.PI / 2, Math.PI * 1.5); context.stroke();
    context.strokeStyle = palette.paid; context.beginPath(); context.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (rate / 100)); context.stroke();
    context.fillStyle = palette.billed; context.textAlign = 'center'; context.font = '800 30px system-ui, sans-serif'; context.fillText(`${rate}%`, centerX, centerY + 8);
    context.font = '12px system-ui, sans-serif'; context.fillStyle = palette.text; context.fillText('collection rate', centerX, centerY + 32);
  }
  function drawTrend(data) {
    const chart = canvasContext('financeTrendCanvas');
    if (!chart) return;
    const { context, width, height } = chart;
    const values = Array.from({ length: 12 }, (_, month) => (data.forms || []).reduce((sum, form) => sum + Number(data.trends?.[form]?.[month] || 0), 0));
    const max = Math.max(...values, 1); const left = 34; const right = 12; const top = 18; const bottom = 30;
    drawGrid(context, width, height, left, right, top, bottom, 3);
    const points = values.map((value, index) => ({ x: left + ((width - left - right) / 11) * index, y: height - bottom - (value / max) * (height - top - bottom) }));
    context.beginPath(); points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)); context.strokeStyle = palette.blue; context.lineWidth = 3; context.stroke();
    points.forEach((point, index) => { context.beginPath(); context.arc(point.x, point.y, 3.5, 0, Math.PI * 2); context.fillStyle = palette.blue; context.fill(); if (index % 2 === 0) { context.fillStyle = palette.text; context.font = '10px system-ui, sans-serif'; context.textAlign = 'center'; context.fillText(String(index + 1), point.x, height - 10); } });
  }
  function render(data) {
    dashboardData = data;
    const billed = Number(data.total_charged || data.total_charges || data.billed || 0);
    const paid = Number(data.total_paid || data.paid || 0);
    document.getElementById('financeBilled').textContent = money(billed);
    document.getElementById('financePaid').textContent = money(paid);
    document.getElementById('financeBalance').textContent = money(Math.max(billed - paid, 0));
    document.getElementById('financeToday').textContent = String(data.payments_today || 0);
    drawCollections(data); drawRate(data); drawTrend(data);
  }
  function setupFinanceSidebar() {
    const sidebar = document.querySelector('.finance-sidebar');
    if (!sidebar) return;
    const isAdmin = ['admin', 'rba'].includes(String(JSON.parse(sessionStorage.getItem('adminUser') || '{}').role || '').toLowerCase());
    sidebar.innerHTML = `<div class="sidebar-brand">Finance workspace</div>
      <div class="sidebar-section"><h3>Overview</h3><a class="sidebar-link active" href="admin-finance.html">Dashboard</a><a class="sidebar-link" href="admin-finance-balances.html">Balances</a><a class="sidebar-link" href="admin-finance-receipts.html">Receipt ledger</a></div>
      <div class="sidebar-section"><h3>Operations</h3><a class="sidebar-link" href="admin-finance-payments.html">Record payment</a><a class="sidebar-link" href="admin-finance-structure.html">Fee structures</a><a class="sidebar-link" href="admin-finance-statements.html">Statements</a><a class="sidebar-link" href="admin-finance-upload.html">Documents</a></div>
      ${isAdmin ? '<div class="sidebar-section"><h3>Administration</h3><a class="sidebar-link" href="admin-roles.html">Staff roles</a><a class="sidebar-link" href="admin-dashboard.html">Admin portal</a></div>' : ''}
      <div class="sidebar-section"><a class="sidebar-link" href="#" data-admin-logout>Sign out</a></div>`;
    document.querySelectorAll('[data-admin-logout]').forEach((element) => element.addEventListener('click', (event) => { event.preventDefault(); logout(); }));
  }
  async function load() {
    const button = document.getElementById('refreshFinanceDashboard');
    if (button) button.disabled = true;
    try {
      const [summaryResponse, chartsResponse] = await Promise.all([fetchWithAuth('/finance/overview'), fetchWithAuth('/finance/overview-charts?no_cache=1')]);
      const summary = await summaryResponse.json(); const charts = await chartsResponse.json();
      if (!summaryResponse.ok) throw new Error(summary.message || 'Could not load finance summary');
      if (!chartsResponse.ok) throw new Error(charts.message || 'Could not load finance charts');
      render({ ...summary, ...charts });
    } catch (error) {
      ['financeCollectionsCanvas', 'financeRateCanvas', 'financeTrendCanvas'].forEach((id) => emptyChart(id, 'Finance statistics are unavailable right now.'));
      console.error('Finance dashboard load error:', error);
    } finally { if (button) button.disabled = false; }
  }
  window.addEventListener('resize', () => { if (dashboardData) { drawCollections(dashboardData); drawRate(dashboardData); drawTrend(dashboardData); } });
  document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('finance-portal-page');
    setupFinanceSidebar();
    document.getElementById('refreshFinanceDashboard')?.addEventListener('click', load);
    load();
  });
})();
