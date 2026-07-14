(function(){
  const STORAGE_KEY = 'bud-tracker-state-v1';
  const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  const today = new Date();
  const state = {
    budget: 15000,
    viewYear: today.getFullYear(),
    viewMonth: today.getMonth(),
    entries: [], // {id, date:'YYYY-MM-DD', type:'expense'|'income', amount, desc}
    activeDay: null,
    formType: 'expense',
  };

  // ---------------- Persistence ----------------
  let saveIndicatorTimer = null;
  function showSaveIndicator(){
    const el = document.getElementById('saveIndicator');
    if(!el) return;
    el.classList.add('show');
    clearTimeout(saveIndicatorTimer);
    saveIndicatorTimer = setTimeout(()=> el.classList.remove('show'), 1100);
  }

  function saveState(){
    try{
      const payload = {
        budget: state.budget,
        entries: state.entries,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      showSaveIndicator();
    }catch(err){
      console.error('BUD: failed to save data', err);
    }
  }

  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return;
      const parsed = JSON.parse(raw);
      if(parsed && typeof parsed.budget === 'number' && !isNaN(parsed.budget)){
        state.budget = parsed.budget;
      }
      if(parsed && Array.isArray(parsed.entries)){
        state.entries = parsed.entries.filter(e =>
          e && typeof e.date === 'string' && (e.type==='expense' || e.type==='income') && !isNaN(Number(e.amount))
        );
      }
    }catch(err){
      console.error('BUD: failed to load saved data', err);
    }
  }

  function fmt(n){
    const v = Number(n)||0;
    return v.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
  }
  function dateKey(y,m,d){
    return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  function totalsFor(list){
    let exp=0, inc=0;
    list.forEach(e=>{
      if(e.type==='expense') exp += Number(e.amount);
      else inc += Number(e.amount);
    });
    return {exp, inc, net: inc-exp};
  }

  function computeRemaining(){
    const t = totalsFor(state.entries);
    return state.budget - t.exp + t.inc;
  }

  function entriesForDay(key){
    return state.entries.filter(e=>e.date===key);
  }

  function entriesForMonth(year, month){
    return state.entries.filter(e=>{
      const [y,m] = e.date.split('-').map(Number);
      return y===year && (m-1)===month;
    });
  }

  function render(){
    renderHeader();
    renderCalendar();
    renderLog();
  }

  function renderHeader(){
    const budgetDisplayEl = document.getElementById('budgetDisplay');
    if(budgetDisplayEl) budgetDisplayEl.textContent = '₱' + fmt(state.budget);
    const remaining = computeRemaining();
    const el = document.getElementById('remainingAmt');
    el.textContent = (remaining<0?'-':'') + '₱' + fmt(Math.abs(remaining));
    el.classList.toggle('over', remaining<0);
  }

  function renderCalendar(){
    const label = document.getElementById('calMonthLabel');
    const monthEntries = entriesForMonth(state.viewYear, state.viewMonth);
    const t = totalsFor(monthEntries);
    label.innerHTML = `${MONTHS[state.viewMonth]} ${state.viewYear}<span>₱${fmt(t.exp)} spent this month</span>`;

    const grid = document.getElementById('dayGrid');
    grid.innerHTML = '';
    const firstOfMonth = new Date(state.viewYear, state.viewMonth, 1);
    const startDay = firstOfMonth.getDay();
    const daysInMonth = new Date(state.viewYear, state.viewMonth+1, 0).getDate();
    const cells = [];
    for(let i=0;i<startDay;i++) cells.push(null);
    for(let d=1; d<=daysInMonth; d++) cells.push(d);
    while(cells.length % 7 !== 0) cells.push(null);

    const isCurrentMonth = state.viewYear===today.getFullYear() && state.viewMonth===today.getMonth();

    cells.forEach(d=>{
      const cell = document.createElement('div');
      if(!d){
        cell.className = 'day-cell empty';
        grid.appendChild(cell);
        return;
      }
      const key = dateKey(state.viewYear, state.viewMonth, d);
      const list = entriesForDay(key);
      const t = totalsFor(list);
      const isToday = isCurrentMonth && d===today.getDate();

      cell.className = 'day-cell' + (isToday ? ' today' : '');
      cell.innerHTML = `<span>${d}</span>`;
      if(list.length){
        const dots = document.createElement('div');
        dots.className = 'day-dots';
        if(t.exp>0){ const s=document.createElement('span'); s.className='exp'; dots.appendChild(s); }
        if(t.inc>0){ const s=document.createElement('span'); s.className='inc'; dots.appendChild(s); }
        cell.appendChild(dots);
      }
      cell.addEventListener('click', ()=> openDay(key));
      grid.appendChild(cell);
    });
  }

  function renderLog(){
    const listEl = document.getElementById('logList');
    const titleEl = document.getElementById('logTitle');
    listEl.innerHTML = '';

    const isCurrentMonth = state.viewYear===today.getFullYear() && state.viewMonth===today.getMonth();
    if(titleEl){
      titleEl.textContent = isCurrentMonth ? 'Log' : `Log — ${MONTHS[state.viewMonth]} ${state.viewYear}`;
    }

    const monthEntries = entriesForMonth(state.viewYear, state.viewMonth);
    if(monthEntries.length===0){
      listEl.innerHTML = `<div class="empty-log">No entries logged this month.<br>Tap a day on the calendar to add one.</div>`;
      return;
    }

    // Group by day, most recent day first
    const byDay = {};
    monthEntries.forEach(e=>{
      (byDay[e.date] = byDay[e.date] || []).push(e);
    });
    const dayKeys = Object.keys(byDay).sort((a,b)=> b.localeCompare(a));

    dayKeys.forEach(key=>{
      const list = [...byDay[key]].sort((a,b)=> b.id.localeCompare(a.id));
      const d = new Date(key+'T00:00:00');
      const dayNum = d.getDate();
      const weekday = d.toLocaleDateString(undefined,{weekday:'short'});
      const t = totalsFor(list);

      const group = document.createElement('div');
      group.className = 'log-day-group';
      group.innerHTML = `
        <div class="log-day-label">
          <div class="log-day-num">${dayNum}</div>
          <div class="log-day-wd">${weekday}</div>
        </div>
        <div class="log-day-entries"></div>
      `;
      const entriesEl = group.querySelector('.log-day-entries');

      list.forEach(e=>{
        const isExp = e.type==='expense';
        const row = document.createElement('div');
        row.className = 'log-row';
        row.innerHTML = `
          <div class="log-icon ${isExp?'exp':'inc'}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="${isExp?'M5 12h14':'M12 5v14M5 12h14'}"/></svg>
          </div>
          <div class="log-amount">₱${fmt(e.amount)}</div>
          <div class="log-meta">
            <div class="log-desc">${escapeHtml(e.desc || (isExp?'Expense':'Income'))}</div>
          </div>
          <button class="log-del" aria-label="Delete entry" data-id="${e.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/></svg>
          </button>
        `;
        row.querySelector('.log-del').addEventListener('click', ()=>{
          state.entries = state.entries.filter(x=>x.id!==e.id);
          saveState();
          render();
          if(state.activeDay) renderModalEntries();
        });
        entriesEl.appendChild(row);
      });

      listEl.appendChild(group);
    });
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ---- Calendar nav ----
  document.getElementById('prevMonth').addEventListener('click', ()=>{
    if(state.viewMonth===0){ state.viewMonth=11; state.viewYear--; } else state.viewMonth--;
    renderCalendar();
    renderLog();
  });
  document.getElementById('nextMonth').addEventListener('click', ()=>{
    if(state.viewMonth===11){ state.viewMonth=0; state.viewYear++; } else state.viewMonth++;
    renderCalendar();
    renderLog();
  });

  // ---- Budget edit ----
  const editIconSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`;

  function restoreBudgetView(){
    const container = document.getElementById('budgetLineView');
    container.innerHTML = `
      <span>BUDGET: <span id="budgetDisplay">₱${fmt(state.budget)}</span></span>
      <button id="editBudgetBtn" aria-label="Edit budget" title="Edit budget">${editIconSvg}</button>
    `;
  }

  function enterBudgetEdit(){
    const container = document.getElementById('budgetLineView');
    container.innerHTML = `
      <span>BUDGET: ₱</span>
      <input class="budget-edit-input" id="budgetEditInput" value="${state.budget}" inputmode="decimal">
    `;
    const input = document.getElementById('budgetEditInput');
    input.focus();
    input.select();
    let committed = false;
    function commit(){
      if(committed) return;
      committed = true;
      const v = parseFloat(input.value);
      state.budget = isNaN(v) ? 0 : v;
      restoreBudgetView();
      saveState();
      render();
    }
    input.addEventListener('keydown', e=>{ if(e.key==='Enter') commit(); });
    input.addEventListener('blur', commit);
  }

  // Delegate clicks on the container so the button works even after re-render
  document.getElementById('budgetLineView').addEventListener('click', (e)=>{
    const btn = e.target.closest('#editBudgetBtn');
    if(btn && !document.getElementById('budgetEditInput')){
      enterBudgetEdit();
    }
  });

  // ---- Modal ----
  function openDay(key){
    state.activeDay = key;
    state.formType = 'expense';
    document.getElementById('amountInput').value = '';
    document.getElementById('descInput').value = '';
    setFormType('expense');
    const d = new Date(key+'T00:00:00');
    document.getElementById('modalDate').textContent = d.toLocaleDateString(undefined,{weekday:'long', month:'long', day:'numeric'});
    renderModalEntries();
    document.getElementById('overlay').style.display = 'flex';
  }
  function closeModal(){
    document.getElementById('overlay').style.display = 'none';
    state.activeDay = null;
  }
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('overlay').addEventListener('click', (e)=>{
    if(e.target.id==='overlay') closeModal();
  });

  function renderModalEntries(){
    const list = entriesForDay(state.activeDay);
    const t = totalsFor(list);
    document.getElementById('modalDayTotal').textContent = `₱${fmt(t.exp+t.inc)} logged`;
    const container = document.getElementById('modalEntries');
    container.innerHTML = '';
    if(list.length===0){
      container.innerHTML = `<div class="no-entries">No entries for this day yet.</div>`;
      return;
    }
    list.forEach(e=>{
      const isExp = e.type==='expense';
      const row = document.createElement('div');
      row.className = 'log-row';
      row.innerHTML = `
        <div class="log-icon ${isExp?'exp':'inc'}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="${isExp?'M5 12h14':'M12 5v14M5 12h14'}"/></svg>
        </div>
        <div class="log-amount">₱${fmt(e.amount)}</div>
        <div class="log-meta">
          <div class="log-desc">${escapeHtml(e.desc || (isExp?'Expense':'Income'))}</div>
        </div>
        <button class="log-del" aria-label="Delete entry" data-id="${e.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/></svg>
        </button>
      `;
      row.querySelector('.log-del').addEventListener('click', ()=>{
        state.entries = state.entries.filter(x=>x.id!==e.id);
        saveState();
        renderModalEntries();
        render();
      });
      container.appendChild(row);
    });
  }

  function setFormType(t){
    state.formType = t;
    document.getElementById('typeExpBtn').classList.toggle('active', t==='expense');
    document.getElementById('typeIncBtn').classList.toggle('active', t==='income');
  }
  document.getElementById('typeExpBtn').addEventListener('click', ()=> setFormType('expense'));
  document.getElementById('typeIncBtn').addEventListener('click', ()=> setFormType('income'));

  function addEntry(){
    const amt = parseFloat(document.getElementById('amountInput').value);
    if(!amt || amt<=0) return;
    const desc = document.getElementById('descInput').value.trim();
    state.entries.push({
      id: Date.now()+'-'+Math.random().toString(36).slice(2,7),
      date: state.activeDay,
      type: state.formType,
      amount: amt,
      desc: desc,
    });
    document.getElementById('amountInput').value = '';
    document.getElementById('descInput').value = '';
    saveState();
    renderModalEntries();
    render();
  }
  document.getElementById('addEntryBtn').addEventListener('click', addEntry);
  document.getElementById('descInput').addEventListener('keydown', e=>{ if(e.key==='Enter') addEntry(); });
  document.getElementById('amountInput').addEventListener('keydown', e=>{ if(e.key==='Enter') addEntry(); });

  // ---- Init ----
  loadState();
  render();
})();
