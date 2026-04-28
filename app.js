/* ─── Price Tracker App ─────────────────────────────────────────────────────── */

const STORAGE_KEY = 'pricetracker_products';
const ALERT_KEY   = 'pricetracker_alerts';

/* ── State ── */
let products = [];
let alerts   = [];
let editingId = null;
let updateTargetId = null;
let activeTab = 'dashboard';

/* ── Helpers ── */
const $  = id => document.getElementById(id);
const fmt = n  => `$${parseFloat(n).toFixed(2)}`;
const uid = () => '_' + Math.random().toString(36).slice(2, 9);
const now = () => new Date().toISOString();
const fmtDate = iso => new Date(iso).toLocaleDateString('en-US', {
  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
});

/* ── Persistence ── */
function load() {
  try { products = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { products = []; }
  try { alerts   = JSON.parse(localStorage.getItem(ALERT_KEY))   || []; } catch { alerts   = []; }
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  localStorage.setItem(ALERT_KEY,   JSON.stringify(alerts));
}

/* ── Tab Navigation ── */
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  $(`tab-${tab}`).classList.add('active');
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  renderAll();
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

/* ── Add Product Modal ── */
function openAddModal(id = null) {
  editingId = id;
  $('modalTitle').textContent = id ? 'Edit Product' : 'Add Product';
  $('saveBtn').textContent    = id ? 'Save Changes' : 'Save Product';

  if (id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    $('fieldName').value     = p.name;
    $('fieldUrl').value      = p.url || '';
    $('fieldPrice').value    = p.currentPrice;
    $('fieldTarget').value   = p.targetPrice || '';
    $('fieldCategory').value = p.category || 'Other';
    $('fieldNotes').value    = p.notes || '';
  } else {
    $('productForm').reset();
  }
  $('modalOverlay').classList.add('open');
}

function closeModal() {
  $('modalOverlay').classList.remove('open');
  editingId = null;
}

$('openAddModal').addEventListener('click', () => openAddModal());
$('openAddModal2')?.addEventListener('click', () => openAddModal());
$('closeModal').addEventListener('click', closeModal);
$('cancelModal').addEventListener('click', closeModal);
$('modalOverlay').addEventListener('click', e => { if (e.target === $('modalOverlay')) closeModal(); });

$('productForm').addEventListener('submit', e => {
  e.preventDefault();
  const price = parseFloat($('fieldPrice').value);
  if (isNaN(price) || price < 0) return;

  if (editingId) {
    const p = products.find(x => x.id === editingId);
    if (p) {
      p.name      = $('fieldName').value.trim();
      p.url       = $('fieldUrl').value.trim();
      p.category  = $('fieldCategory').value;
      p.notes     = $('fieldNotes').value.trim();
      // price update via edit also logs history
      if (price !== p.currentPrice) {
        p.history.push({ price, date: now() });
        checkAlert(p, price);
        p.currentPrice = price;
      }
      const target = parseFloat($('fieldTarget').value);
      p.targetPrice = isNaN(target) ? null : target;
    }
  } else {
    const target = parseFloat($('fieldTarget').value);
    const p = {
      id:           uid(),
      name:         $('fieldName').value.trim(),
      url:          $('fieldUrl').value.trim(),
      category:     $('fieldCategory').value,
      notes:        $('fieldNotes').value.trim(),
      currentPrice: price,
      initialPrice: price,
      targetPrice:  isNaN(target) ? null : target,
      history:      [{ price, date: now() }],
      addedAt:      now(),
    };
    products.unshift(p);
  }

  save();
  closeModal();
  renderAll();
});

/* ── Update Price Modal ── */
function openUpdateModal(id) {
  updateTargetId = id;
  const p = products.find(x => x.id === id);
  $('updateProductName').textContent = p.name;
  $('updatePrice').value = p.currentPrice;
  $('updateOverlay').classList.add('open');
}
function closeUpdate() {
  $('updateOverlay').classList.remove('open');
  updateTargetId = null;
}
$('closeUpdate').addEventListener('click', closeUpdate);
$('cancelUpdate').addEventListener('click', closeUpdate);
$('updateOverlay').addEventListener('click', e => { if (e.target === $('updateOverlay')) closeUpdate(); });

$('confirmUpdate').addEventListener('click', () => {
  const price = parseFloat($('updatePrice').value);
  if (isNaN(price) || price < 0) return;
  const p = products.find(x => x.id === updateTargetId);
  if (!p) return;

  checkAlert(p, price);
  p.history.push({ price, date: now() });
  p.currentPrice = price;

  save();
  closeUpdate();
  renderAll();
});

/* ── Alert Logic ── */
function checkAlert(p, newPrice) {
  const oldPrice = p.currentPrice;
  const drop = oldPrice - newPrice;

  if (drop > 0) {
    const alert = {
      id:        uid(),
      productId: p.id,
      productName: p.name,
      oldPrice,
      newPrice,
      drop,
      date:      now(),
      targetHit: p.targetPrice !== null && newPrice <= p.targetPrice,
      unread:    true,
    };
    alerts.unshift(alert);
    if (alerts.length > 100) alerts.pop();
  }
}

/* ── Delete Product ── */
function deleteProduct(id) {
  if (!confirm('Remove this product from tracking?')) return;
  products = products.filter(p => p.id !== id);
  alerts   = alerts.filter(a => a.productId !== id);
  save();
  renderAll();
}

/* ── Detail Modal ── */
let detailChart = null;

function openDetail(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;

  $('detailTitle').textContent = p.name;

  const firstPrice = p.initialPrice;
  const currPrice  = p.currentPrice;
  const diff       = currPrice - firstPrice;
  const diffPct    = firstPrice ? ((diff / firstPrice) * 100).toFixed(1) : 0;
  const diffColor  = diff <= 0 ? 'green' : 'red';

  // build history table rows
  const histRows = [...p.history].reverse().slice(0, 10).map((h, i, arr) => {
    const prev = arr[i + 1];
    let changeCell = '—';
    if (prev) {
      const d = h.price - prev.price;
      const cls = d < 0 ? 'change-down' : 'change-up';
      const sign = d < 0 ? '▼' : '▲';
      changeCell = `<span class="${cls}">${sign} ${fmt(Math.abs(d))}</span>`;
    }
    return `<tr>
      <td>${fmtDate(h.date)}</td>
      <td>${fmt(h.price)}</td>
      <td>${changeCell}</td>
    </tr>`;
  }).join('');

  $('detailBody').innerHTML = `
    <div class="detail-prices">
      <div class="detail-price-block">
        <div class="detail-price-label">Current Price</div>
        <div class="detail-price-val">${fmt(currPrice)}</div>
      </div>
      <div class="detail-price-block">
        <div class="detail-price-label">Initial Price</div>
        <div class="detail-price-val">${fmt(firstPrice)}</div>
      </div>
      <div class="detail-price-block">
        <div class="detail-price-label">Change</div>
        <div class="detail-price-val ${diffColor}">${diff <= 0 ? '▼' : '▲'} ${fmt(Math.abs(diff))} (${Math.abs(diffPct)}%)</div>
      </div>
      ${p.targetPrice ? `<div class="detail-price-block">
        <div class="detail-price-label">Target Price</div>
        <div class="detail-price-val accent">${fmt(p.targetPrice)}</div>
      </div>` : ''}
    </div>

    ${p.url ? `<p style="margin-bottom:14px"><a href="${p.url}" target="_blank" rel="noopener"
      style="color:var(--accent2);text-decoration:none;font-size:.875rem;">🔗 View Product</a></p>` : ''}

    <div class="detail-grid">
      <div>
        <div class="section-title">Price History</div>
        ${p.history.length < 2 ? '<p style="color:var(--text-muted);font-size:.875rem">Update the price to build history.</p>'
          : `<div class="chart-wrap"><canvas id="detailChart"></canvas></div>`}
      </div>
      <div>
        <div class="section-title">Recent Updates</div>
        <table class="history-table">
          <thead><tr><th>Date</th><th>Price</th><th>Change</th></tr></thead>
          <tbody>${histRows || '<tr><td colspan="3" style="color:var(--text-muted)">No history yet</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div style="display:flex;gap:10px;margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
      <button class="btn btn-success btn-sm" onclick="openUpdateModal('${p.id}');closeDetail()">Update Price</button>
      <button class="btn btn-ghost btn-sm" onclick="openAddModal('${p.id}');closeDetail()">Edit</button>
      <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}');closeDetail()">Delete</button>
    </div>
  `;

  $('detailOverlay').classList.add('open');

  // Draw chart after DOM is ready
  if (p.history.length >= 2) {
    requestAnimationFrame(() => {
      const ctx = document.getElementById('detailChart');
      if (!ctx) return;
      if (detailChart) { detailChart.destroy(); detailChart = null; }
      const labels = p.history.map(h => fmtDate(h.date));
      const data   = p.history.map(h => h.price);
      detailChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Price',
            data,
            borderColor: '#6c63ff',
            backgroundColor: 'rgba(108,99,255,.15)',
            fill: true,
            tension: 0.35,
            pointRadius: 4,
            pointBackgroundColor: '#6c63ff',
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#8892a4', maxTicksLimit: 5 }, grid: { color: '#2e3349' } },
            y: { ticks: { color: '#8892a4', callback: v => `$${v}` }, grid: { color: '#2e3349' } },
          }
        }
      });
    });
  }
}

function closeDetail() {
  $('detailOverlay').classList.remove('open');
  if (detailChart) { detailChart.destroy(); detailChart = null; }
}
$('closeDetail').addEventListener('click', closeDetail);
$('detailOverlay').addEventListener('click', e => { if (e.target === $('detailOverlay')) closeDetail(); });

/* ── Render Functions ── */

function renderDashboard() {
  // Stats
  const drops = products.filter(p => p.currentPrice < p.initialPrice).length;
  const alertsActive = products.filter(p => p.targetPrice !== null && p.currentPrice > p.targetPrice).length;
  let totalSaved = 0;
  products.forEach(p => { if (p.currentPrice < p.initialPrice) totalSaved += p.initialPrice - p.currentPrice; });

  $('statTotal').textContent  = products.length;
  $('statAlerts').textContent = alertsActive;
  $('statDrops').textContent  = drops;
  $('statSaved').textContent  = `$${totalSaved.toFixed(2)}`;

  // Recent activity (last 10 alerts)
  const container = $('recentActivity');
  if (alerts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <p>No activity yet. Add products to start tracking!</p>
      </div>`;
    return;
  }

  container.innerHTML = alerts.slice(0, 10).map(a => `
    <div class="activity-item">
      <div class="activity-icon">📉</div>
      <div class="activity-info">
        <div class="activity-name">${esc(a.productName)}</div>
        <div class="activity-meta">${fmt(a.oldPrice)} → ${fmt(a.newPrice)} · ${fmtDate(a.date)}</div>
      </div>
      <div class="activity-badge ${a.targetHit ? 'badge-target' : 'badge-drop'}">
        ${a.targetHit ? '🎯 Target Hit' : `▼ ${fmt(a.drop)}`}
      </div>
    </div>
  `).join('');
}

function renderProducts() {
  const query  = $('searchInput').value.toLowerCase();
  const filter = $('filterSelect').value;

  let list = products.filter(p => {
    const matchQ = !query || p.name.toLowerCase().includes(query) || (p.category || '').toLowerCase().includes(query);
    let matchF = true;
    if (filter === 'drops')   matchF = p.currentPrice < p.initialPrice;
    if (filter === 'target')  matchF = p.targetPrice !== null && p.currentPrice <= p.targetPrice;
    if (filter === 'watching') matchF = p.targetPrice !== null && p.currentPrice > p.targetPrice;
    return matchQ && matchF;
  });

  const grid = $('productGrid');
  if (list.length === 0) {
    grid.innerHTML = `
      <div class="empty-state full">
        <div class="empty-icon">${products.length === 0 ? '🛒' : '🔍'}</div>
        <p>${products.length === 0 ? 'No products added yet.' : 'No products match your filter.'}</p>
        ${products.length === 0 ? `<button class="btn btn-primary" onclick="openAddModal()">+ Add Your First Product</button>` : ''}
      </div>`;
    return;
  }

  grid.innerHTML = list.map(p => {
    const diff    = p.currentPrice - p.initialPrice;
    const diffPct = p.initialPrice ? ((diff / p.initialPrice) * 100).toFixed(1) : 0;
    const hasChange = p.history.length > 1;
    const changeHtml = hasChange
      ? `<span class="price-change ${diff < 0 ? 'down' : 'up'}">${diff < 0 ? '▼' : '▲'} ${Math.abs(diffPct)}%</span>`
      : '';

    let cardClass = '';
    if (diff < 0) cardClass = 'drop';
    if (p.targetPrice !== null && p.currentPrice <= p.targetPrice) cardClass = 'target-hit';
    else if (diff > 0) cardClass = 'rise';

    let targetHtml = '';
    if (p.targetPrice !== null) {
      const progress = Math.min(100, Math.max(0, ((p.initialPrice - p.currentPrice) / (p.initialPrice - p.targetPrice)) * 100));
      const hit = p.currentPrice <= p.targetPrice;
      targetHtml = `
        <div class="card-target">
          <span>🎯 ${fmt(p.targetPrice)}</span>
          <div class="target-bar"><div class="target-fill ${hit ? 'hit' : ''}" style="width:${hit ? 100 : Math.max(0, progress)}%"></div></div>
          ${hit ? '<span style="color:var(--green);font-weight:700">Hit!</span>' : ''}
        </div>`;
    }

    return `
      <div class="product-card ${cardClass}" onclick="openDetail('${p.id}')">
        <div class="card-header">
          <div class="card-name">${esc(p.name)}</div>
          <div class="card-category">${esc(p.category || 'Other')}</div>
        </div>
        <div class="card-prices">
          <div class="price-current">${fmt(p.currentPrice)}</div>
          ${hasChange && diff !== 0 ? `<div class="price-original">${fmt(p.initialPrice)}</div>` : ''}
          ${changeHtml}
        </div>
        ${targetHtml}
        <div class="card-footer" onclick="event.stopPropagation()">
          <button class="btn btn-ghost btn-sm" onclick="openUpdateModal('${p.id}')">Update Price</button>
          <button class="btn btn-ghost btn-sm" onclick="openDetail('${p.id}')">Details</button>
        </div>
      </div>`;
  }).join('');
}

function renderAlerts() {
  const list = $('alertList');
  if (alerts.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔕</div>
        <p>No alerts triggered yet. Set target prices to get notified!</p>
      </div>`;
    return;
  }

  list.innerHTML = alerts.map(a => `
    <div class="alert-item ${a.unread ? 'unread' : ''}">
      <div class="alert-icon">${a.targetHit ? '🎯' : '📉'}</div>
      <div class="alert-info">
        <div class="alert-title">${esc(a.productName)} — ${a.targetHit ? 'Target Price Hit!' : 'Price Drop'}</div>
        <div class="alert-desc">${fmt(a.oldPrice)} → ${fmt(a.newPrice)} · Saved ${fmt(a.drop)}</div>
      </div>
      <div class="alert-time">${fmtDate(a.date)}</div>
    </div>
  `).join('');

  // Mark all as read
  alerts.forEach(a => a.unread = false);
  save();
}

function renderAll() {
  renderDashboard();
  renderProducts();
  renderAlerts();
}

/* ── Search & Filter Live ── */
$('searchInput').addEventListener('input', renderProducts);
$('filterSelect').addEventListener('change', renderProducts);

/* ── XSS-safe escaping ── */
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Seed demo data if empty ── */
function seedDemo() {
  if (products.length > 0) return;
  const demo = [
    {
      id: uid(), name: 'Sony WH-1000XM5 Headphones', url: '',
      category: 'Electronics', notes: 'Best noise-cancelling headphones',
      currentPrice: 279.99, initialPrice: 349.99, targetPrice: 249.99,
      addedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
      history: [
        { price: 349.99, date: new Date(Date.now() - 7 * 86400000).toISOString() },
        { price: 329.99, date: new Date(Date.now() - 5 * 86400000).toISOString() },
        { price: 299.99, date: new Date(Date.now() - 3 * 86400000).toISOString() },
        { price: 279.99, date: new Date(Date.now() - 1 * 86400000).toISOString() },
      ]
    },
    {
      id: uid(), name: 'Apple AirPods Pro (2nd Gen)', url: '',
      category: 'Electronics', notes: '',
      currentPrice: 219.00, initialPrice: 249.00, targetPrice: 199.00,
      addedAt: new Date(Date.now() - 14 * 86400000).toISOString(),
      history: [
        { price: 249.00, date: new Date(Date.now() - 14 * 86400000).toISOString() },
        { price: 239.00, date: new Date(Date.now() - 10 * 86400000).toISOString() },
        { price: 219.00, date: new Date(Date.now() -  6 * 86400000).toISOString() },
      ]
    },
    {
      id: uid(), name: 'Samsung 65" QLED 4K TV', url: '',
      category: 'Electronics', notes: 'For the living room',
      currentPrice: 1099.99, initialPrice: 999.99, targetPrice: 899.99,
      addedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
      history: [
        { price: 999.99, date: new Date(Date.now() - 4 * 86400000).toISOString() },
        { price: 1099.99, date: new Date(Date.now() - 2 * 86400000).toISOString() },
      ]
    },
  ];

  products = demo;

  // Seed alerts
  alerts = [
    {
      id: uid(), productId: demo[0].id, productName: demo[0].name,
      oldPrice: 329.99, newPrice: 299.99, drop: 30.00,
      date: new Date(Date.now() - 3 * 86400000).toISOString(),
      targetHit: false, unread: false,
    },
    {
      id: uid(), productId: demo[0].id, productName: demo[0].name,
      oldPrice: 299.99, newPrice: 279.99, drop: 20.00,
      date: new Date(Date.now() - 1 * 86400000).toISOString(),
      targetHit: false, unread: true,
    },
    {
      id: uid(), productId: demo[1].id, productName: demo[1].name,
      oldPrice: 249.00, newPrice: 219.00, drop: 30.00,
      date: new Date(Date.now() - 6 * 86400000).toISOString(),
      targetHit: false, unread: false,
    },
  ];

  save();
}

/* ── Init ── */
load();
seedDemo();
renderAll();
