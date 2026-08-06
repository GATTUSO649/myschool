// financeDocs.js - helper for finance pages to fetch statement/structure documents

function getApiUrl(){
  if (typeof CONFIG !== 'undefined' && CONFIG.API_URL) return CONFIG.API_URL;
  if (typeof window !== 'undefined' && window.location) {
    return `${window.location.origin}/api`;
  }
  return 'https://cresenthighschool.onrender.com/api';
}
function getAuthToken(){
  return localStorage.getItem('authToken');
}
async function fetchWithAuth(endpoint, options={}){
  const token = getAuthToken();
  const headers = {'Content-Type':'application/json', ...options.headers};
  if(token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(getApiUrl()+endpoint, {...options, headers});
}

function buildFinanceFileUrl(filename) {
  if (!filename) return '';
  const base = getApiUrl().replace(/\/api\/?$/, '');
  return `${base}/api/finance/files/${encodeURIComponent(filename)}`;
}

async function loadFinanceDocs(type, formClass, term, options = {}){
  try{
    let url = '/finance/docs';
    const params = [];
    if(type) params.push('type=' + encodeURIComponent(type));
    if(formClass) params.push('className=' + encodeURIComponent(formClass));
    if(term) params.push('term=' + encodeURIComponent(term));
    if(params.length) url += '?' + params.join('&');
    const res = await fetchWithAuth(url);
    if(res.ok){
      const docs = await res.json();
      renderFinanceDocs(docs, options);
    } else {
      console.error('Failed to load finance docs', res.status);
    }
  }catch(e){console.error('loadFinanceDocs error', e);}  
}

function renderFinanceDocs(docs, options = {}){
  const container = document.getElementById('financeDocsContainer');
  if(!container) return;
  container.innerHTML = '';
  if(!docs || docs.length === 0){
    container.innerHTML = '<p class="text-center text-muted">No documents available.</p>';
    return;
  }

  const inlinePdf = !!options.inlinePdf;
  const pdfDocs = docs.filter(doc => {
    const filename = String(doc.filename || '').toLowerCase();
    return doc.mime_type === 'application/pdf' || filename.endsWith('.pdf');
  });

  if(inlinePdf && pdfDocs.length){
    let selectedDoc = pdfDocs[0];

    const previewShell = document.createElement('div');
    previewShell.className = 'finance-doc-preview';

    const title = document.createElement('h3');
    title.textContent = selectedDoc.title || selectedDoc.filename || 'Fee Document';
    previewShell.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'finance-doc-actions';
    actions.innerHTML = `
      <button type="button" class="finance-button" id="financePreviewDownload">Open PDF</button>
      <button type="button" class="finance-button" id="financePreviewNewTab">Open in New Tab</button>
    `;
    previewShell.appendChild(actions);

    const iframe = document.createElement('iframe');
    iframe.src = buildFinanceFileUrl(selectedDoc.filename);
    iframe.className = 'finance-preview-frame';
    iframe.setAttribute('title', selectedDoc.title || 'Document Preview');
    iframe.style.width = '100%';
    iframe.style.minHeight = '720px';
    iframe.style.border = '1px solid #d1d5db';
    iframe.style.borderRadius = '12px';
    iframe.style.background = '#fff';
    previewShell.appendChild(iframe);

    const switcher = document.createElement('div');
    switcher.className = 'finance-doc-selector';
    switcher.style.display = 'flex';
    switcher.style.flexWrap = 'wrap';
    switcher.style.gap = '12px';
    switcher.style.marginTop = '18px';

    pdfDocs.forEach((doc, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'finance-button finance-selector-button';
      button.textContent = doc.title || `PDF Document ${index + 1}`;
      if(index === 0) button.classList.add('active');
      button.addEventListener('click', () => {
        selectedDoc = doc;
        title.textContent = doc.title || doc.filename || 'Fee Document';
        iframe.src = buildFinanceFileUrl(doc.filename);
        previewShell.querySelectorAll('.finance-selector-button').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
      });
      switcher.appendChild(button);
    });
    previewShell.appendChild(switcher);

    container.appendChild(previewShell);

    document.getElementById('financePreviewDownload')?.addEventListener('click', () => {
      window.location.href = buildFinanceFileUrl(selectedDoc.filename);
    });
    document.getElementById('financePreviewNewTab')?.addEventListener('click', () => {
      window.open(buildFinanceFileUrl(selectedDoc.filename), '_blank');
    });

    const extraDocs = docs.filter(doc => !pdfDocs.includes(doc));
    if(extraDocs.length){
      const extraHeader = document.createElement('h4');
      extraHeader.textContent = 'Other Documents';
      extraHeader.style.marginTop = '28px';
      container.appendChild(extraHeader);
      extraDocs.forEach(doc => {
        const card = document.createElement('div');
        card.className = 'doc-card';
        const viewerUrl = `document_viewer.html?filename=${encodeURIComponent(doc.filename)}&title=${encodeURIComponent(doc.title)}&type=${encodeURIComponent(doc.type)}`;
        card.innerHTML = `<h4>${doc.title}</h4><a href="${viewerUrl}" target="_blank">Open Document</a><p class="small-text">${doc.uploaded_at || ''}</p>`;
        container.appendChild(card);
      });
    }

    return;
  }

  docs.forEach(doc=>{
    const card = document.createElement('div');
    card.className = 'doc-card';
    const viewerUrl = `document_viewer.html?filename=${encodeURIComponent(doc.filename)}&title=${encodeURIComponent(doc.title)}&type=${encodeURIComponent(doc.type)}`;
    card.innerHTML = `<h4>${doc.title}</h4><a href="${viewerUrl}" target="_blank">Open Document</a><p class="small-text">${doc.uploaded_at || ''}</p>`;
    container.appendChild(card);
  });
}

// listen for updates triggered by admin uploads
window.addEventListener('storage', (e)=>{
  if(e.key === 'financeDocsUpdated'){
    const path = window.location.pathname || '';
    let currentType = document.querySelector('select[name="type"]')?.value;
    let formClass = null;
    let term = null;
    let inlinePdf = false;

    if (path.endsWith('feestatement.html')) {
      currentType = 'feestatement';
      inlinePdf = true;
    } else if (path.endsWith('feestructure.html')) {
      currentType = 'feestructure';
      const params = new URLSearchParams(window.location.search);
      formClass = params.get('form');
      term = params.get('term');
      inlinePdf = !!formClass;
    }

    if (typeof loadFinanceDocs === 'function' && currentType) {
      loadFinanceDocs(currentType, formClass, term, { inlinePdf });
    }
  }
});
