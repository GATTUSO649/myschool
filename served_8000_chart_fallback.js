(function () {
  function clearCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = canvas.clientWidth || 360;
    const height = canvas.clientHeight || 300;
    ctx.clearRect(0, 0, width, height);
  }

  function drawBarChart(chart) {
    const ctx = chart.ctx;
    const width = chart.canvas.clientWidth || 360;
    const height = chart.canvas.clientHeight || 300;
    const config = chart.config;
    const dataset = (config.data && config.data.datasets && config.data.datasets[0]) || {};
    const values = Array.isArray(dataset.data) ? dataset.data : [];
    const labels = Array.isArray(config.data.labels) ? config.data.labels : [];
    const maxValue = Math.max(...values, 100);

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      const y = 24 + i * ((height - 48) / 4);
      ctx.beginPath();
      ctx.moveTo(36, y);
      ctx.lineTo(width - 18, y);
      ctx.stroke();
    }
    ctx.restore();

    const chartWidth = width - 56;
    const chartHeight = height - 48;
    const gap = values.length > 1 ? 20 : 0;
    const barWidth = values.length > 1 ? Math.max(28, (chartWidth - gap * (values.length - 1)) / values.length) : 60;

    values.forEach((value, index) => {
      const x = 36 + index * (barWidth + gap);
      const ratio = Math.max(0.08, Number(value || 0) / maxValue);
      const barHeight = Math.max(18, ratio * chartHeight);
      const y = height - 24 - barHeight;
      ctx.fillStyle = Array.isArray(dataset.backgroundColor) ? dataset.backgroundColor[index % dataset.backgroundColor.length] : (dataset.backgroundColor || '#2563eb');
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 8);
      ctx.fill();

      if (labels[index]) {
        ctx.fillStyle = '#475569';
        ctx.font = '11px Inter, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(labels[index].slice(0, 10), x + barWidth / 2, height - 8);
      }

      if (value !== undefined && value !== null) {
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 11px Inter, Arial, sans-serif';
        ctx.fillText(String(value), x + barWidth / 2, y - 6);
      }
    });
  }

  function drawLineChart(chart) {
    const ctx = chart.ctx;
    const width = chart.canvas.clientWidth || 360;
    const height = chart.canvas.clientHeight || 300;
    const config = chart.config;
    const dataset = (config.data && config.data.datasets && config.data.datasets[0]) || {};
    const values = Array.isArray(dataset.data) ? dataset.data : [];
    const labels = Array.isArray(config.data.labels) ? config.data.labels : [];
    const maxValue = Math.max(...values, 100);

    ctx.clearRect(0, 0, width, height);
    ctx.beginPath();
    ctx.moveTo(36, height - 24);
    ctx.lineTo(width - 18, height - 24);
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.1)';
    ctx.stroke();

    if (!values.length) {
      ctx.fillStyle = '#64748b';
      ctx.font = '12px Inter, Arial, sans-serif';
      ctx.fillText('No trend data yet', 36, 36);
      return;
    }

    const plotWidth = width - 56;
    const plotHeight = height - 48;
    const points = values.map((value, index) => {
      const x = 36 + (plotWidth / Math.max(1, values.length - 1)) * index;
      const y = height - 24 - (Number(value || 0) / maxValue) * plotHeight;
      return { x, y };
    });

    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.strokeStyle = dataset.borderColor || '#14b8a6';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = dataset.backgroundColor || 'rgba(20, 184, 166, 0.12)';
    ctx.lineTo(points[points.length - 1].x, height - 24);
    ctx.lineTo(points[0].x, height - 24);
    ctx.closePath();
    ctx.fill();

    points.forEach((point, index) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = dataset.pointBackgroundColor || '#0f766e';
      ctx.fill();
      if (labels[index]) {
        ctx.fillStyle = '#475569';
        ctx.font = '10px Inter, Arial, sans-serif';
        ctx.fillText(labels[index], point.x - 10, height - 8);
      }
    });
  }

  function drawDoughnutChart(chart) {
    const ctx = chart.ctx;
    const width = chart.canvas.clientWidth || 360;
    const height = chart.canvas.clientHeight || 300;
    const config = chart.config;
    const dataset = (config.data && config.data.datasets && config.data.datasets[0]) || {};
    const values = Array.isArray(dataset.data) ? dataset.data : [];
    const total = values.reduce((sum, value) => sum + Math.max(0, Number(value || 0)), 0) || 1;

    ctx.clearRect(0, 0, width, height);
    const radius = Math.min(width, height) * 0.28;
    const centerX = width / 2;
    const centerY = height / 2 + 6;
    let startAngle = -Math.PI / 2;

    values.forEach((value, index) => {
      const slice = (Number(value || 0) / total) * Math.PI * 2;
      const color = Array.isArray(dataset.backgroundColor) ? dataset.backgroundColor[index % dataset.backgroundColor.length] : (dataset.backgroundColor || '#2563eb');
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, startAngle + slice);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      startAngle += slice;
    });

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 14px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Balance', centerX, centerY - 4);

    const legendY = height - 22;
    const legendColors = Array.isArray(dataset.backgroundColor) ? dataset.backgroundColor : [dataset.backgroundColor || '#2563eb'];
    legendColors.forEach((color, index) => {
      ctx.fillStyle = color;
      ctx.fillRect(28 + index * 90, legendY, 12, 12);
      ctx.fillStyle = '#475569';
      ctx.font = '10px Inter, Arial, sans-serif';
      ctx.fillText(index === 0 ? 'Outstanding' : 'Paid', 44 + index * 90, legendY + 10);
    });
  }

  function drawPieChart(chart) {
    const ctx = chart.ctx;
    const width = chart.canvas.clientWidth || 360;
    const height = chart.canvas.clientHeight || 300;
    const config = chart.config;
    const dataset = (config.data && config.data.datasets && config.data.datasets[0]) || {};
    const values = Array.isArray(dataset.data) ? dataset.data : [];
    const labels = Array.isArray(config.data.labels) ? config.data.labels : [];
    const total = values.reduce((sum, value) => sum + Math.max(0, Number(value || 0)), 0) || 1;

    ctx.clearRect(0, 0, width, height);
    const radius = Math.min(width, height) * 0.38;
    const centerX = width / 2;
    const centerY = height / 2 + 6;
    let startAngle = -Math.PI / 2;

    values.forEach((value, index) => {
      const slice = (Number(value || 0) / total) * Math.PI * 2;
      const color = Array.isArray(dataset.backgroundColor) ? dataset.backgroundColor[index % dataset.backgroundColor.length] : (dataset.backgroundColor || '#2563eb');
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, startAngle + slice);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      startAngle += slice;
    });

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();

    if (labels.length) {
      ctx.fillStyle = '#475569';
      ctx.font = '10px Inter, Arial, sans-serif';
      ctx.textAlign = 'left';
      const legendStart = 24;
      const legendY = height - 24;
      labels.forEach((label, index) => {
        const color = Array.isArray(dataset.backgroundColor) ? dataset.backgroundColor[index % dataset.backgroundColor.length] : (dataset.backgroundColor || '#2563eb');
        const y = legendY + index * 16;
        ctx.fillStyle = color;
        ctx.fillRect(legendStart, y, 12, 12);
        ctx.fillStyle = '#0f172a';
        ctx.fillText(label, legendStart + 18, y + 10);
      });
    }
  }

  class Chart {
    constructor(canvas, config) {
      if (!canvas || !canvas.getContext) {
        return;
      }
      this.canvas = canvas;
      this.config = config || {};
      this.ctx = canvas.getContext('2d');
      this._resizeHandler = this.resize.bind(this);
      window.addEventListener('resize', this._resizeHandler);
      this.resize();
    }

    resize() {
      if (!this.canvas || !this.ctx) return;
      const ratio = window.devicePixelRatio || 1;
      const width = this.canvas.clientWidth || 360;
      const height = this.canvas.clientHeight || 300;
      this.canvas.width = Math.max(1, Math.floor(width * ratio));
      this.canvas.height = Math.max(1, Math.floor(height * ratio));
      this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      this.render();
    }

    render() {
      if (!this.ctx) return;
      const type = this.config.type || 'bar';
      if (type === 'doughnut') {
        drawDoughnutChart(this);
      } else if (type === 'pie') {
        drawPieChart(this);
      } else if (type === 'line') {
        drawLineChart(this);
      } else {
        drawBarChart(this);
      }
    }

    destroy() {
      if (this._resizeHandler) {
        window.removeEventListener('resize', this._resizeHandler);
      }
      clearCanvas(this.canvas);
    }
  }

  window.Chart = Chart;
}());

