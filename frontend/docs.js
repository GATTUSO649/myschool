// Common document handling for academics pages
function getApiUrl(){
  return (typeof CONFIG !== 'undefined' && CONFIG.API_URL) ? CONFIG.API_URL : window.location.origin + '/api';
}
function getAuthToken(){
  return localStorage.getItem('authToken');
}
async function fetchWithAuth(endpoint, options={}){
  const token = getAuthToken();
  const isForm = options.body instanceof FormData;
  const headers = isForm ? {...options.headers} : {'Content-Type':'application/json', ...options.headers};
  if(token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(getApiUrl()+endpoint, {...options, headers});
}

const SCHOOL_FORMS = ['Form 1', 'Form 2', 'Form 3', 'Form 4'];
const EIGHT_FOUR_FOUR_SUBJECTS = [
  'English',
  'Kiswahili',
  'Mathematics',
  'Biology',
  'Physics',
  'Chemistry',
  'History and Government',
  'Geography',
  'Christian Religious Education',
  'Business Studies',
  'Computer Studies',
  'Agriculture'
];

function replaceOptions(select, options, placeholder) {
  if (!select) return;
  select.innerHTML = `<option value="">${placeholder}</option>` + options.map(option => `<option value="${option}">${option}</option>`).join('');
}

function enforceSchoolOptions() {
  document.querySelectorAll('select[name="subject"], #noteSubject, #materialSubject').forEach(select => {
    replaceOptions(select, EIGHT_FOUR_FOUR_SUBJECTS, 'Select Subject');
  });
  document.querySelectorAll('select[name="class"], #noteClass').forEach(select => {
    replaceOptions(select, SCHOOL_FORMS, 'Select Class');
  });
}

function renderDocs(docs){
  const container = document.getElementById('docsContainer');
  if(!container) return;
  container.innerHTML = '';
  if(!docs || docs.length === 0){
    container.innerHTML = '<p class="text-center text-muted">No documents found.</p>';
    return;
  }
  const student = JSON.parse(localStorage.getItem('student')||'{}');
  const isLecturer = student.role === 'lecturer' || student.role === 'rba';
  docs.forEach(doc => {
    const card = document.createElement('div');
    card.className = 'doc-card';
    const linkUrl = `${getApiUrl().replace(/\/api\/?$/,'')}/api/academics/files/${doc.filename}`;
    let inner = `<h4>${doc.title}</h4>
      <a href="${linkUrl}" target="_blank">View PDF</a>
      <p class="small-text">${doc.uploaded_at}</p>`;
    if(isLecturer){
      inner += `<div class="doc-actions doc-action-row">
          <button class="edit-doc doc-action-button" data-id="${doc.id}" data-title="${doc.title}" data-type="${doc.type}">Edit</button>
          <button class="delete-doc doc-action-button doc-action-delete" data-id="${doc.id}">Delete</button>
        </div>`;
    }
    card.innerHTML = inner;
    container.appendChild(card);
  });
  if(isLecturer){
    // attach listeners after DOM additions
    container.querySelectorAll('.delete-doc').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = btn.getAttribute('data-id');
        deleteDoc(id);
      });
    });
    container.querySelectorAll('.edit-doc').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = btn.getAttribute('data-id');
        const title = btn.getAttribute('data-title');
        const type = btn.getAttribute('data-type');
        editDoc(id, title, type);
      });
    });
  }
}

async function loadDocs(type){
  try{
    let url = '/academics/docs';
    if(type) url += '?type='+encodeURIComponent(type);
    const res = await fetchWithAuth(url);
    if(res.ok){
      const docs = await res.json();
      renderDocs(docs);
    } else {
      console.error('Failed to load docs', res.status);
    }
  }catch(e){console.error('loadDocs error', e);}  
}

// load counts for each document type and populate dashboard cards
async function loadDocCounts(){
  const types = ['notes','assignments','revision'];
  for(const type of types){
    try{
      const res = await fetchWithAuth(`/academics/docs?type=${type}`);
      if(res.ok){
        const docs = await res.json();
        const card = document.querySelector(`.dashboard-card[data-type="${type}"] .doc-count`);
        if(card){
          card.textContent = docs.length > 0 ? `${docs.length} file${docs.length>1?'s':''}` : 'No files';
        }
      }
    }catch(err){console.error('count load error', type, err);}
  }
}

function showUploadFormIfLecturer(){
  const student = JSON.parse(localStorage.getItem('student') || '{}');
  if(student.role === 'lecturer' || student.role === 'rba'){
    const s = document.getElementById('uploadSection');
    if(s) s.style.display = 'block';
  }
}

document.addEventListener('DOMContentLoaded', ()=>{
  enforceSchoolOptions();
  showUploadFormIfLecturer();
  const form = document.getElementById('uploadForm');
  if(form){
    form.addEventListener('submit', async e=>{
      e.preventDefault();
      const formData = new FormData(form);
      try{
        const res = await fetchWithAuth('/academics/docs', {method:'POST', body: formData});
        const data = await res.json();
        if(data.success){
          alert('Upload successful');
          loadDocs(formData.get('type'));
        } else {
          alert(data.message || 'Upload failed');
        }
      }catch(err){console.error(err); alert('Error uploading');}
    });
  }
});

// listen for notifications about document changes (triggered by admin uploads)
window.addEventListener('storage', (e)=>{
  if(e.key === 'docsUpdated'){
    // refresh counts and current list if we're on a docs page
    try{ loadDocCounts(); }catch{};
    const currentType = document.querySelector('select[name="type"]')?.value;
    if(typeof loadDocs === 'function') loadDocs(currentType);
  }
});

async function deleteDoc(id){
  if(!confirm('Are you sure you want to delete this document?')) return;
  try{
    const res = await fetchWithAuth(`/academics/docs/${id}`, {method:'DELETE'});
    if(res.ok){
      alert('Deleted');
      // refresh both list and counts
      const currentType = document.querySelector('select[name="type"]')?.value;
      loadDocs(currentType);
      loadDocCounts();
    } else {
      const data = await res.json();
      alert(data.message || 'Delete failed');
    }
  }catch(e){console.error(e); alert('Error deleting');}
}

async function editDoc(id, currentTitle, currentType){
  const newTitle = prompt('New title', currentTitle) || currentTitle;
  const newType = prompt('New type (notes, assignments, revision)', currentType) || currentType;
  if(newTitle === currentTitle && newType === currentType) return;
  try{
    const res = await fetchWithAuth(`/academics/docs/${id}`, {
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({title:newTitle, type:newType})
    });
    if(res.ok){
      alert('Updated');
      loadDocs(newType === currentType? currentType : newType);
      loadDocCounts();
    } else {
      const data = await res.json();
      alert(data.message || 'Update failed');
    }
  }catch(e){console.error(e); alert('Error updating');}
}
