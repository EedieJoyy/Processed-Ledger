(function(){
  /* ============================================================
     SUPABASE CONFIG — paste your values from
     Project Settings → API in the Supabase dashboard
     ============================================================ */
  const SUPABASE_URL = 'https://lkfaveewkgkwxtegwmbe.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_1mB7p4Qy6opG7kTGNwy6CQ_MobA5t0k';

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const CURRENCY = '₱';
  let debts = [];
  let currentFilter = 'all';
  let searchTerm = '';
  let editingId = null;

  const $ = s => document.querySelector(s);
  const lockScreen = $('#lock-screen');
  const app = $('#app');
  const lockError = $('#lock-error');
  const loginForm = $('#login-form');

  function fmtMoney(n){
    const v = Number(n)||0;
    return CURRENCY + v.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2});
  }

  /* ---------- Mapping between DB rows and app objects ---------- */
  function fromDb(row){
    return {
      id: row.id,
      borrower: row.borrower,
      desc: row.description,
      price: Number(row.price),
      qty: Number(row.qty),
      date: row.date_made,
      dueDate: row.due_date || null,
      status: row.status,
      amountPaid: Number(row.amount_paid) || 0,
      notes: row.notes || '',
      archived: !!row.archived
    };
  }
  function toDb(entry){
    return {
      borrower: entry.borrower,
      description: entry.desc,
      price: entry.price,
      qty: entry.qty,
      date_made: entry.date,
      due_date: entry.dueDate || null,
      status: entry.status,
      amount_paid: entry.status === 'partial' ? entry.amountPaid : (entry.status === 'paid' ? entry.price * entry.qty : 0),
      notes: entry.notes,
      archived: !!entry.archived
    };
  }

  /* ---------- Auth ---------- */
  const mascot = $('#mascot');
  const passwordInput = $('#login-password');
  const forgotPanel = $('#forgot-panel');
  const resetPanel = $('#reset-panel');
  const forgotError = $('#forgot-error');
  const forgotSuccess = $('#forgot-success');
  const resetError = $('#reset-error');
  const resetSuccess = $('#reset-success');

  if(mascot){
    const animals = ['pig','chicken','cow'];
    mascot.classList.add(animals[Math.floor(Math.random()*animals.length)]);
  }
  if(passwordInput && mascot){
    passwordInput.addEventListener('focus', ()=> mascot.classList.add('covering'));
    passwordInput.addEventListener('blur', ()=> mascot.classList.remove('covering'));
  }

  function showLoginView(){
    loginForm.style.display = 'block';
    forgotPanel.style.display = 'none';
    resetPanel.style.display = 'none';
    lockError.textContent = '';
    $('#lock-title').textContent = 'Sign in';
    $('#lock-sub').textContent = 'Only you have access to this ledger.';
  }
  function showForgotView(){
    loginForm.style.display = 'none';
    forgotPanel.style.display = 'block';
    resetPanel.style.display = 'none';
    forgotError.textContent = '';
    forgotSuccess.style.display = 'none';
    $('#forgot-email').value = $('#login-email').value || '';
    $('#lock-title').textContent = 'Reset password';
    $('#lock-sub').textContent = "We'll email you a reset link.";
  }
  function showResetView(){
    loginForm.style.display = 'none';
    forgotPanel.style.display = 'none';
    resetPanel.style.display = 'block';
    resetError.textContent = '';
    resetSuccess.style.display = 'none';
    $('#lock-title').textContent = 'Set a new password';
    $('#lock-sub').textContent = 'Choose a new password for your account.';
  }

  $('#forgot-link').addEventListener('click', showForgotView);
  $('#back-to-login-btn').addEventListener('click', showLoginView);

  $('#send-reset-btn').addEventListener('click', async ()=>{
    forgotError.textContent = '';
    forgotSuccess.style.display = 'none';
    const email = $('#forgot-email').value.trim();
    if(!email){ forgotError.textContent = 'Enter your email first.'; return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });
    if(error){
      forgotError.textContent = error.message || 'Could not send reset link.';
      return;
    }
    forgotSuccess.textContent = 'Check your email for a reset link. It may take a minute to arrive.';
    forgotSuccess.style.display = 'block';
  });

  $('#save-new-password-btn').addEventListener('click', async ()=>{
    resetError.textContent = '';
    resetSuccess.style.display = 'none';
    const pw = $('#reset-password').value;
    const pwConfirm = $('#reset-password-confirm').value;
    if(pw.length < 6){ resetError.textContent = 'Password must be at least 6 characters.'; return; }
    if(pw !== pwConfirm){ resetError.textContent = "Passwords don't match."; return; }
    const { error } = await supabase.auth.updateUser({ password: pw });
    if(error){
      resetError.textContent = error.message || 'Could not update password.';
      return;
    }
    resetSuccess.textContent = 'Password updated. You can now use it to sign in.';
    resetSuccess.style.display = 'block';
    $('#reset-password').value = '';
    $('#reset-password-confirm').value = '';
    setTimeout(async ()=>{
      await supabase.auth.signOut();
      showLoginView();
    }, 1800);
  });

  loginForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    lockError.textContent = '';
    const email = $('#login-email').value.trim();
    const password = $('#login-password').value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if(error){
      lockError.textContent = error.message || 'Could not sign in.';
      return;
    }
    await afterLogin();
  });

  $('#relock-btn').addEventListener('click', async ()=>{
    await supabase.auth.signOut();
    showLock();
  });

  function showLock(){
    app.style.display = 'none';
    lockScreen.style.display = 'flex';
    lockError.textContent = '';
    loginForm.reset();
    showLoginView();
  }
  function showApp(){
    lockScreen.style.display = 'none';
    app.style.display = 'block';
  }

  async function afterLogin(){
    showApp();
    await loadData();
    render();
  }

  /* ---------- Data (Supabase) ---------- */
  async function loadData(){
    const { data, error } = await supabase
      .from('debts')
      .select('*')
      .order('date_made', { ascending: false });
    if(error){
      console.error('load error', error);
      debts = [];
      return;
    }
    debts = data.map(fromDb);
  }

  async function insertDebt(entry){
    const { data, error } = await supabase
      .from('debts')
      .insert(toDb(entry))
      .select()
      .single();
    if(error){ alert('Could not save: ' + error.message); return null; }
    return fromDb(data);
  }
  async function updateDebt(id, entry){
    const { data, error } = await supabase
      .from('debts')
      .update(toDb(entry))
      .eq('id', id)
      .select()
      .single();
    if(error){ alert('Could not save: ' + error.message); return null; }
    return fromDb(data);
  }
  async function deleteDebt(id){
    const { error } = await supabase.from('debts').delete().eq('id', id);
    if(error){ alert('Could not delete: ' + error.message); return false; }
    return true;
  }

  function balanceOf(d){
    const total = d.price * d.qty;
    if(d.status === 'paid') return 0;
    if(d.status === 'partial') return Math.max(total - (Number(d.amountPaid)||0), 0);
    return total;
  }

  function isOverdue(d){
    if(!d.dueDate || d.status === 'paid' || d.archived) return false;
    const today = new Date(); today.setHours(0,0,0,0);
    const due = new Date(d.dueDate + 'T00:00:00');
    return due < today;
  }

  function computeSummary(){
    let pending=0, partial=0, paid=0, collected=0;
    debts.filter(d=>!d.archived).forEach(d=>{
      const total = d.price * d.qty;
      if(d.status === 'paid'){
        paid += total;
        collected += total;
      } else if(d.status === 'partial'){
        partial += balanceOf(d);
        collected += Number(d.amountPaid) || 0;
      } else {
        pending += total;
      }
    });
    const outstanding = pending + partial;
    $('#sum-pending').textContent = fmtMoney(pending);
    $('#sum-partial').textContent = fmtMoney(partial);
    $('#sum-paid').textContent = fmtMoney(paid);
    $('#sum-count').textContent = debts.filter(d=>!d.archived).length;
    $('#sum-collected').textContent = fmtMoney(collected);
    $('#sum-outstanding').textContent = fmtMoney(outstanding);
  }

  function renderList(){
    const container = $('#list-container');
    let filtered = debts.filter(d=>{
      if(currentFilter === 'archived') return d.archived;
      if(d.archived) return false;
      if(currentFilter !== 'all' && d.status !== currentFilter) return false;
      if(searchTerm){
        const s = searchTerm.toLowerCase();
        if(!d.borrower.toLowerCase().includes(s) && !d.desc.toLowerCase().includes(s)) return false;
      }
      return true;
    });
    filtered.sort((a,b)=> new Date(b.date) - new Date(a.date));

    if(filtered.length === 0){
      container.innerHTML = `<div class="empty">
        <div class="glyph">—</div>
        <div>${debts.length===0 ? 'No debts recorded yet. Add the first one.' : 'Nothing matches that search or filter.'}</div>
      </div>`;
      return;
    }

    container.innerHTML = '';
    filtered.forEach(d=>{
      const total = d.price * d.qty;
      const bal = balanceOf(d);
      const overdue = isOverdue(d);
      const row = document.createElement('div');
      row.className = 'row' + (overdue ? ' overdue' : '');
      row.innerHTML = `
        <div class="main">
          <div class="desc">${escapeHtml(d.desc)}</div>
          <div class="sub">
            Made ${formatDate(d.date)}${d.dueDate ? ` · Due ${formatDate(d.dueDate)}` : ''}
            ${overdue ? '<span class="overdue-tag">Overdue</span>' : ''}
          </div>
        </div>
        <div class="borrower">${escapeHtml(d.borrower)}</div>
        <div class="qty">${d.qty} × ${fmtMoney(d.price)}</div>
        <div class="amount">
          ${fmtMoney(total)}
          ${d.status==='partial' ? `<div class="rem">₱ ${bal.toLocaleString(undefined,{minimumFractionDigits:2})} left</div>` : ''}
        </div>
        <div class="status-badge ${d.status}">${capitalize(d.status)}</div>
      `;
      row.addEventListener('click', ()=> openModal(d.id));
      container.appendChild(row);
    });
  }

  function escapeHtml(s){
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }
  function capitalize(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
  function formatDate(iso){
    const dt = new Date(iso + 'T00:00:00');
    return dt.toLocaleDateString(undefined,{year:'numeric', month:'short', day:'numeric'});
  }

  function render(){ computeSummary(); renderList(); }

  /* ---------- Filters / search ---------- */
  $('#filter-pills').addEventListener('click', (e)=>{
    const pill = e.target.closest('.pill');
    if(!pill) return;
    document.querySelectorAll('.pill').forEach(p=>p.classList.remove('active'));
    pill.classList.add('active');
    currentFilter = pill.dataset.filter;
    render();
  });
  $('#search').addEventListener('input', (e)=>{
    searchTerm = e.target.value;
    render();
  });

  /* ---------- Modal ---------- */
  const overlay = $('#overlay');
  const form = $('#debt-form');
  let selectedStatus = 'pending';

  function openModal(id){
    editingId = id || null;
    const isEdit = !!editingId;
    const editingEntry = isEdit ? debts.find(x=>x.id===editingId) : null;
    const isArchived = isEdit && editingEntry.archived;

    $('#modal-title').textContent = isEdit ? (isArchived ? 'Archived entry' : 'Edit debt') : 'Add debt';
    $('#delete-btn').style.display = isArchived ? 'block' : 'none';
    $('#restore-btn').style.display = isArchived ? 'block' : 'none';
    $('#archive-btn').style.display = (isEdit && !isArchived) ? 'block' : 'none';

    if(isEdit){
      const d = editingEntry;
      $('#f-borrower').value = d.borrower;
      $('#f-desc').value = d.desc;
      $('#f-price').value = d.price;
      $('#f-qty').value = d.qty;
      $('#f-date').value = d.date;
      $('#f-duedate').value = d.dueDate || '';
      $('#f-notes').value = d.notes || '';
      $('#f-amountpaid').value = d.amountPaid || '';
      selectedStatus = d.status;
    } else {
      form.reset();
      $('#f-date').value = new Date().toISOString().slice(0,10);
      $('#f-duedate').value = '';
      $('#f-qty').value = 1;
      selectedStatus = 'pending';
    }
    updateStatusUI();
    overlay.classList.add('show');
  }
  function closeModal(){
    overlay.classList.remove('show');
    editingId = null;
    form.reset();
  }
  function updateStatusUI(){
    document.querySelectorAll('.status-select .opt').forEach(o=>{
      o.classList.toggle('active', o.dataset.status === selectedStatus);
    });
    $('#amount-paid-field').style.display = selectedStatus === 'partial' ? 'block' : 'none';
  }
  $('#status-select').addEventListener('click', (e)=>{
    const opt = e.target.closest('.opt');
    if(!opt) return;
    selectedStatus = opt.dataset.status;
    updateStatusUI();
  });
  $('#add-btn').addEventListener('click', ()=> openModal(null));
  $('#cancel-btn').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e)=>{ if(e.target === overlay) closeModal(); });

  $('#archive-btn').addEventListener('click', async ()=>{
    if(!editingId) return;
    if(confirm('Archive this entry? It will move out of your main list but the data stays saved — you can restore it later.')){
      const d = debts.find(x=>x.id===editingId);
      const saved = await updateDebt(editingId, { ...d, archived: true });
      if(saved){
        const idx = debts.findIndex(x=>x.id===editingId);
        debts[idx] = saved;
        render();
        closeModal();
      }
    }
  });

  $('#restore-btn').addEventListener('click', async ()=>{
    if(!editingId) return;
    const d = debts.find(x=>x.id===editingId);
    const saved = await updateDebt(editingId, { ...d, archived: false });
    if(saved){
      const idx = debts.findIndex(x=>x.id===editingId);
      debts[idx] = saved;
      render();
      closeModal();
    }
  });

  $('#delete-btn').addEventListener('click', async ()=>{
    if(!editingId) return;
    if(confirm('Permanently delete this entry? This cannot be undone.')){
      const ok = await deleteDebt(editingId);
      if(ok){
        debts = debts.filter(d=>d.id !== editingId);
        render();
        closeModal();
      }
    }
  });

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const entry = {
      borrower: $('#f-borrower').value.trim(),
      desc: $('#f-desc').value.trim(),
      price: parseFloat($('#f-price').value) || 0,
      qty: parseInt($('#f-qty').value) || 1,
      date: $('#f-date').value,
      dueDate: $('#f-duedate').value || null,
      status: selectedStatus,
      amountPaid: selectedStatus === 'partial' ? (parseFloat($('#f-amountpaid').value) || 0) : 0,
      notes: $('#f-notes').value.trim()
    };

    if(editingId){
      const existing = debts.find(d=>d.id===editingId);
      entry.archived = existing ? existing.archived : false;
      const saved = await updateDebt(editingId, entry);
      if(saved){
        const idx = debts.findIndex(d=>d.id===editingId);
        debts[idx] = saved;
      }
    } else {
      entry.archived = false;
      const saved = await insertDebt(entry);
      if(saved){
        debts.push(saved);
      }
    }
    render();
    closeModal();
  });

  /* ---------- Reports ---------- */
  function exportCSV(){
    const header = ['Borrower','Description','Price','Qty','Total','Date Made','Due Date','Status','Overdue','Amount Paid','Balance','Notes'];
    const rows = debts.filter(d=>!d.archived).map(d=>{
      const total = d.price * d.qty;
      const bal = balanceOf(d);
      return [
        d.borrower, d.desc, d.price.toFixed(2), d.qty, total.toFixed(2),
        d.date, d.dueDate || '', capitalize(d.status), isOverdue(d) ? 'Yes' : 'No',
        (Number(d.amountPaid)||0).toFixed(2),
        bal.toFixed(2), d.notes || ''
      ];
    });
    const escapeCsv = v => `"${String(v).replace(/"/g,'""')}"`;
    const csv = [header, ...rows].map(r => r.map(escapeCsv).join(',')).join('\r\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chabz-debt-report-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  $('#export-btn').addEventListener('click', exportCSV);
  $('#print-btn').addEventListener('click', ()=>{
    $('#print-date').textContent = 'Generated ' + new Date().toLocaleString();
    window.print();
  });

  /* ---------- Init ---------- */
  (async function init(){
    let handledRecovery = false;
    supabase.auth.onAuthStateChange((event)=>{
      if(event === 'PASSWORD_RECOVERY'){
        handledRecovery = true;
        lockScreen.style.display = 'flex';
        app.style.display = 'none';
        showResetView();
      } else if(event === 'SIGNED_OUT'){
        showLock();
      }
    });

    const { data: { session } } = await supabase.auth.getSession();
    if(session && !handledRecovery){
      await afterLogin();
    } else if(!handledRecovery){
      showLock();
    }
  })();
})();
