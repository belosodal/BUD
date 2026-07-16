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
          e && typeof e.date === 'string' && (e.type==='expense' || e.type==='income' || e.type==='savings') && !isNaN(Number(e.amount))
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
    let exp=0, inc=0, sav=0;
    list.forEach(e=>{
      if(e.type==='expense') exp += Number(e.amount);
      else if(e.type==='savings') sav += Number(e.amount);
      else inc += Number(e.amount);
    });
    return {exp, inc, sav, net: inc-exp-sav};
  }

  function computeRemaining(){
    const t = totalsFor(state.entries);
    return state.budget - t.exp - t.sav + t.inc;
  }

  function computeTotalSavings(){
    return totalsFor(state.entries).sav;
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
    const savingsEl = document.getElementById('savingsAmt');
    if(savingsEl) savingsEl.textContent = '₱' + fmt(computeTotalSavings());
  }

  function renderCalendar(){
    const label = document.getElementById('calMonthLabel');
    const monthEntries = entriesForMonth(state.viewYear, state.viewMonth);
    const t = totalsFor(monthEntries);
    label.innerHTML = `${MONTHS[state.viewMonth]} ${state.viewYear}<span>₱${fmt(t.exp+t.sav)} spent this month</span>`;

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
        if(t.sav>0){ const s=document.createElement('span'); s.className='sav'; dots.appendChild(s); }
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
        const meta = typeMeta(e.type);
        const row = document.createElement('div');
        row.className = 'log-row log-row-clickable';
        row.setAttribute('tabindex', '0');
        row.setAttribute('role', 'button');
        row.setAttribute('aria-label', `Open ${key} entries`);
        row.innerHTML = `
          <div class="log-icon ${meta.cls}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="${meta.path}"/></svg>
          </div>
          <div class="log-amount">₱${fmt(e.amount)}</div>
          <div class="log-meta">
            <div class="log-desc">${escapeHtml(e.desc || meta.label)}</div>
          </div>
          <button class="log-del" aria-label="Delete entry" data-id="${e.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/></svg>
          </button>
        `;
        row.querySelector('.log-del').addEventListener('click', (evt)=>{
          evt.stopPropagation();
          state.entries = state.entries.filter(x=>x.id!==e.id);
          saveState();
          render();
          if(state.activeDay) renderModalEntries();
        });
        row.addEventListener('click', ()=> openEntryDetail(e));
        row.addEventListener('keydown', (evt)=>{
          if(evt.key==='Enter' || evt.key===' '){ evt.preventDefault(); openEntryDetail(e); }
        });
        entriesEl.appendChild(row);
      });

      listEl.appendChild(group);
    });

    adjustLogListMinHeight();
  }

  // Ensure at least 5 entries are visible in the log list before it needs to scroll.
  function adjustLogListMinHeight(){
    const listEl = document.getElementById('logList');
    if(!listEl) return;
    listEl.style.minHeight = '';
    listEl.style.maxHeight = '';
    const rows = listEl.querySelectorAll('.log-row');
    if(rows.length === 0) return;
    const idx = Math.min(rows.length, 5) - 1;
    const targetRow = rows[idx];
    const listTop = listEl.getBoundingClientRect().top;
    const rowBottom = targetRow.getBoundingClientRect().bottom;
    const needed = Math.ceil(rowBottom - listTop) + 2;
    listEl.style.minHeight = needed + 'px';
    // Only cap the height (forcing internal scroll) once there are more than 5 entries.
    if(rows.length > 5){
      listEl.style.maxHeight = needed + 'px';
    }
  }

  function typeMeta(type){
    if(type==='expense') return { cls:'exp', path:'M5 12h14', label:'Expense' };
    if(type==='savings') return { cls:'sav', path:'M12 3l9 9-9 9-9-9 9-9', label:'Savings' };
    return { cls:'inc', path:'M12 5v14M5 12h14', label:'Income' };
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

  // ---- Month/Year dropdown nav ----
  const monthLabelBtn = document.getElementById('calMonthLabel');
  const monthDropdown = document.getElementById('monthDropdown');
  const monthSelect = document.getElementById('monthSelect');
  const yearSelect = document.getElementById('yearSelect');

  function yearRange(){
    // Cover today's year plus any years with logged entries, padded a few years either side.
    const years = new Set([today.getFullYear(), state.viewYear]);
    state.entries.forEach(e=>{
      const y = Number(e.date.split('-')[0]);
      if(!isNaN(y)) years.add(y);
    });
    const min = Math.min(...years) - 3;
    const max = Math.max(...years) + 5;
    const list = [];
    for(let y=min; y<=max; y++) list.push(y);
    return list;
  }

  function populateDropdown(){
    monthSelect.innerHTML = MONTHS.map((m,i)=> `<option value="${i}">${m}</option>`).join('');
    yearSelect.innerHTML = yearRange().map(y=> `<option value="${y}">${y}</option>`).join('');
    monthSelect.value = state.viewMonth;
    yearSelect.value = state.viewYear;
  }

  function openMonthDropdown(){
    populateDropdown();
    monthDropdown.style.display = 'flex';
    monthLabelBtn.setAttribute('aria-expanded','true');
  }
  function closeMonthDropdown(){
    monthDropdown.style.display = 'none';
    monthLabelBtn.setAttribute('aria-expanded','false');
  }

  monthLabelBtn.addEventListener('click', (e)=>{
    e.stopPropagation();
    if(monthDropdown.style.display === 'none') openMonthDropdown();
    else closeMonthDropdown();
  });

  function jumpToSelected(){
    const m = parseInt(monthSelect.value, 10);
    const y = parseInt(yearSelect.value, 10);
    if(isNaN(m) || isNaN(y)) return;
    state.viewMonth = m;
    state.viewYear = y;
    renderCalendar();
    renderLog();
  }
  monthSelect.addEventListener('change', jumpToSelected);
  yearSelect.addEventListener('change', jumpToSelected);

  // Close dropdown on outside click
  document.addEventListener('click', (e)=>{
    if(monthDropdown.style.display !== 'none' && !monthDropdown.contains(e.target) && e.target !== monthLabelBtn){
      closeMonthDropdown();
    }
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
    document.getElementById('modalDayTotal').textContent = `₱${fmt(t.exp+t.inc+t.sav)} logged`;
    const container = document.getElementById('modalEntries');
    container.innerHTML = '';
    if(list.length===0){
      container.innerHTML = `<div class="no-entries">No entries for this day yet.</div>`;
      return;
    }
    list.forEach(e=>{
      const meta = typeMeta(e.type);
      const row = document.createElement('div');
      row.className = 'log-row';
      row.innerHTML = `
        <div class="log-icon ${meta.cls}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="${meta.path}"/></svg>
        </div>
        <div class="log-amount">₱${fmt(e.amount)}</div>
        <div class="log-meta">
          <div class="log-desc">${escapeHtml(e.desc || meta.label)}</div>
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

  function amountPrefix(type){
    if(type==='expense') return '−';
    if(type==='savings') return '◆ ';
    return '+';
  }

  function openEntryDetail(entry){
    const meta = typeMeta(entry.type);
    const d = new Date(entry.date+'T00:00:00');
    document.getElementById('entryModalDate').textContent = d.toLocaleDateString(undefined,{weekday:'long', month:'long', day:'numeric', year:'numeric'});

    const iconEl = document.getElementById('entryModalIcon');
    iconEl.className = 'entry-detail-icon ' + meta.cls;
    iconEl.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="${meta.path}"/></svg>`;

    document.getElementById('entryModalTypeLabel').textContent = meta.label;

    const amountEl = document.getElementById('entryModalAmount');
    amountEl.className = 'entry-detail-amount ' + meta.cls;
    amountEl.textContent = `${amountPrefix(entry.type)}₱${fmt(entry.amount)}`;

    document.getElementById('entryModalDesc').textContent = entry.desc && entry.desc.trim() ? entry.desc : meta.label;

    document.getElementById('entryOverlay').style.display = 'flex';
  }
  function closeEntryDetail(){
    document.getElementById('entryOverlay').style.display = 'none';
  }
  document.getElementById('closeEntryModal').addEventListener('click', closeEntryDetail);
  document.getElementById('entryOverlay').addEventListener('click', (e)=>{
    if(e.target.id==='entryOverlay') closeEntryDetail();
  });

  function setFormType(t){
    state.formType = t;
    document.getElementById('typeExpBtn').classList.toggle('active', t==='expense');
    document.getElementById('typeIncBtn').classList.toggle('active', t==='income');
    document.getElementById('typeSavBtn').classList.toggle('active', t==='savings');
  }
  document.getElementById('typeExpBtn').addEventListener('click', ()=> setFormType('expense'));
  document.getElementById('typeIncBtn').addEventListener('click', ()=> setFormType('income'));
  document.getElementById('typeSavBtn').addEventListener('click', ()=> setFormType('savings'));

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

  // ---- Resize handling ----
  let resizeTimer = null;
  window.addEventListener('resize', ()=>{
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(adjustLogListMinHeight, 120);
  });

  // ---- Init ----
  loadState();
  render();
})();
