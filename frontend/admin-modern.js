// admin-modern.js — frontend-only admin interactions: sidebar toggle, chat preview, quick actions
(function(){
  function setupSidebarToggle() {
    const btn = document.getElementById('sidebarToggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      document.body.classList.toggle('sidebar-collapsed');
      try { localStorage.setItem('adminSidebarCollapsed', document.body.classList.contains('sidebar-collapsed') ? '1' : '0'); } catch (e) {}
    });
    // restore
    try {
      const val = localStorage.getItem('adminSidebarCollapsed');
      if (val === '1') document.body.classList.add('sidebar-collapsed');
    } catch (e) {}
  }

  function setupChat() {
    const openButtons = Array.from(document.querySelectorAll('#openChat, #openChat2'));
    const chatPreview = document.getElementById('chatPreview');
    function openChatPanel() {
      // simple client-only chat modal
      const modal = document.createElement('div');
      modal.style.position = 'fixed';
      modal.style.inset = '80px 24px 24px 24px';
      modal.style.background = '#fff';
      modal.style.borderRadius = '12px';
      modal.style.boxShadow = '0 30px 60px rgba(2,6,23,0.3)';
      modal.style.zIndex = 9999;
      modal.style.display = 'flex';
      modal.style.flexDirection = 'column';
      modal.innerHTML = `
        <div style="padding:12px;border-bottom:1px solid #eef2f6;display:flex;justify-content:space-between;align-items:center">
          <strong>Admin Chat (local)</strong><button id="closeChatModal" class="secondary-button">Close</button>
        </div>
        <div id="chatBody" style="padding:12px;flex:1;overflow:auto;background:#f8fbff"></div>
        <div style="padding:12px;border-top:1px solid #eef2f6;display:flex;gap:8px"><input id="chatInput" style="flex:1;padding:10px;border:1px solid #d6e0ea;border-radius:8px"><button id="chatSend" class="primary-button">Send</button></div>
      `;
      document.body.appendChild(modal);
      document.getElementById('closeChatModal').addEventListener('click', ()=> modal.remove());
      const chatBody = document.getElementById('chatBody');
      const chatInput = document.getElementById('chatInput');
      document.getElementById('chatSend').addEventListener('click', ()=>{
        const text = chatInput.value.trim();
        if (!text) return;
        const el = document.createElement('div');
        el.style.padding='8px 10px';
        el.style.marginBottom='8px';
        el.style.background='#e9f2ff';
        el.style.borderRadius='8px';
        el.textContent = `You: ${text}`;
        chatBody.appendChild(el);
        chatInput.value='';
        chatBody.scrollTop = chatBody.scrollHeight;
      });
    }

    openButtons.forEach(b => b && b.addEventListener('click', (e)=>{ e.preventDefault(); openChatPanel(); }));
    // small preview
    if (chatPreview) chatPreview.textContent = 'No messages yet — click Open chat to start a local admin conversation.';
  }

  function setupQuickActions() {
    const goToApps = document.getElementById('goToApplications');
    if (goToApps) goToApps.addEventListener('click', ()=> window.location.href = 'admin-applications.html');
    const openMigration = document.getElementById('openMigration');
    if (openMigration) openMigration.addEventListener('click', ()=> {
      // navigate to notifications where migration SQL is shown
      window.location.href = 'admin-notifications.html#migration';
    });
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    try { setupSidebarToggle(); } catch(e){}
    try { setupChat(); } catch(e){}
    try { setupQuickActions(); } catch(e){}
  });
})();
