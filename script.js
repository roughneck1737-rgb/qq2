"use strict";
const $=id=>document.getElementById(id);
const dateKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const parseDate=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d);};
const addDays=(d,n)=>new Date(d.getFullYear(),d.getMonth(),d.getDate()+n);
const weekStart=d=>addDays(d,-((d.getDay()+6)%7));
const newId=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`;
const weekdays=['일','월','화','수','목','금','토'];
let today=parseDate(dateKey(new Date())),selected=new Date(today),displayed=new Date(today.getFullYear(),today.getMonth(),1),editing=null;
const STORAGE_KEY='day-space-planner-v1',EXTRA_KEY='day-space-planner-extras-v1';
let tasks={},extras={rules:[],checks:{},skipped:{},notes:{},events:[],overrides:{}};
try {
  const stored=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
  if(stored&&typeof stored==='object'&&!Array.isArray(stored))tasks=stored;
  const saved=JSON.parse(localStorage.getItem(EXTRA_KEY)||'null');
  if(saved&&Array.isArray(saved.rules))extras={...extras,...saved};
  // Upgrade earlier single-day notes and single-weekday rules without removing old tasks.
  extras.events ||= [];extras.overrides ||= {};
  for(const r of extras.rules)r.days ||= [r.weekday];
  for(const [key,notes] of Object.entries(extras.notes||{}))for(const n of notes){
    const id=`legacy-${key}-${n.id}`;if(!extras.events.some(e=>e.id===id))extras.events.push({id,text:n.text,start:key,end:key});
  }
  extras.notes={};
} catch { $('storage-status').textContent='저장된 내용을 읽지 못했습니다. 현재 창에서 사용할 수 있습니다.'; }
function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(tasks));localStorage.setItem(EXTRA_KEY,JSON.stringify(extras));$('storage-status').textContent='이 브라우저에 자동 저장됩니다.';}catch{$('storage-status').textContent='자동 저장이 불가능합니다. 창을 닫으면 변경 내용이 사라질 수 있습니다.';}}
function tasksFor(d){const key=dateKey(d);return [...(tasks[key]||[]),...extras.rules.filter(r=>r.days.includes(d.getDay())&&key>=r.start&&(!r.end||key<=r.end)&&!extras.skipped[`${key}/${r.id}`]).map(r=>({...r,...extras.overrides[`${key}/${r.id}`],id:r.id,weekly:true,done:!!extras.checks[`${key}/${r.id}`]}))].sort((a,b)=>(a.startTime||'99:99').localeCompare(b.startTime||'99:99'));}
function notesFor(key){return extras.events.filter(e=>e.start<=key&&e.end>=key).sort((a,b)=>a.start.localeCompare(b.start)||a.id.localeCompare(b.id));}
function timeLabel(t){return t.startTime?`${t.startTime}${t.endTime?' – '+t.endTime:''}`:'시간 미정';}
function timeError(start,end){return end&&!start?'종료 시간과 함께 시작 시간을 입력하세요.':start&&end&&end<=start?'종료 시간은 시작 시간보다 늦어야 합니다. (같은 날 기준)':'';}
function validDate(s){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&dateKey(parseDate(s))===s;}
function datesError(start,end){return !validDate(start)||!validDate(end)?'시작일과 종료일을 입력하세요.':end<start?'종료일은 시작일과 같거나 이후여야 합니다.':'';}
function picks(name){return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(e=>Number(e.value));}
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function action(text,label,handler){const b=el('button','row-action',text);b.type='button';b.setAttribute('aria-label',label);b.addEventListener('click',handler);return b;}
function finish(){persist();render();}
function renderCalendar(){
  $('month-title').textContent=`${displayed.getFullYear()}년 ${displayed.getMonth()+1}월`;$('year').textContent=today.getFullYear();
  const start=weekStart(displayed),days=new Date(displayed.getFullYear(),displayed.getMonth()+1,0).getDate(),count=Math.ceil((((displayed.getDay()+6)%7)+days)/7)*7;
  const current=weekStart(today),end=addDays(current,6);
  $('week-label').textContent=`이번 주 · ${current.getMonth()+1}.${current.getDate()} — ${end.getMonth()+1}.${end.getDate()}`;$('calendar').replaceChildren();
  for(let offset=0;offset<count;offset+=7){
    const row=el('div','calendar-week'),ws=addDays(start,offset),we=addDays(ws,6),wsKey=dateKey(ws),weKey=dateKey(we);
    for(let i=0;i<7;i++){
      const d=addDays(ws,i),key=dateKey(d),items=tasksFor(d),notes=notesFor(key),button=el('button','day');button.type='button';button.dataset.date=key;
      button.classList.toggle('outside',d.getMonth()!==displayed.getMonth());button.classList.toggle('current-week',d>=current&&d<=end);button.classList.toggle('is-today',key===dateKey(today));button.classList.toggle('selected',key===dateKey(selected));button.setAttribute('aria-pressed',String(key===dateKey(selected)));
      if(key===dateKey(today))button.setAttribute('aria-current','date');
      button.setAttribute('aria-label',`${key}${key===dateKey(today)?', 오늘':''}, 할 일 ${items.length}개${notes.length?', '+notes.map(n=>n.text).join(', '):''}`);
      button.append(el('span','day-number',d.getDate()));if(key===dateKey(today))button.append(el('span','today-label','오늘'));
      if(items.length)button.append(el('span','task-count',`${items.filter(t=>t.done).length}/${items.length} 완료`));
      button.addEventListener('click',()=>selectDate(d));button.addEventListener('keydown',e=>{const n={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[e.key];if(n!==undefined){e.preventDefault();selectDate(addDays(d,n));}});row.append(button);
    }
    // Each event occupies its own track, so overlapping periods remain visible.
    const events=extras.events.filter(e=>e.start<=weKey&&e.end>=wsKey).sort((a,b)=>a.start.localeCompare(b.start)||a.id.localeCompare(b.id));
    events.forEach((event,index)=>{
      let from=0,to=6;while(dateKey(addDays(ws,from))<event.start)from++;while(dateKey(addDays(ws,to))>event.end)to--;
      const bar=el('button','event-bar',event.text);bar.type='button';bar.style.gridColumn=`${from+1} / ${to+2}`;bar.style.gridRow=String(index+2);bar.classList.toggle('continues-before',event.start<wsKey);bar.classList.toggle('continues-after',event.end>weKey);bar.title=`${event.text} · ${event.start} ~ ${event.end}`;bar.setAttribute('aria-label',bar.title+' 수정');bar.addEventListener('click',()=>openEditor('event',event));row.append(bar);
    });
    $('calendar').append(row);
  }
}
function selectDate(d){selected=new Date(d);displayed=new Date(d.getFullYear(),d.getMonth(),1);$('note-start').value=dateKey(d);$('note-end').value=dateKey(d);render();document.querySelector(`[data-date="${dateKey(d)}"]`)?.focus({preventScroll:true});}
function renderTodos(){
  const key=dateKey(selected),items=tasksFor(selected);$('selected-date').textContent=selected.toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'long'})+(key===dateKey(today)?' · 오늘':'');
  const updateProgress=()=>{$('progress-text').textContent=`${items.filter(t=>t.done).length} / ${items.length}`;$('progress').max=items.length||1;$('progress').value=items.filter(t=>t.done).length;};updateProgress();$('empty-state').hidden=!!items.length;$('todo-list').replaceChildren();
  for(const task of items){
    const li=el('li','todo-item'),check=el('input'),content=el('div','task-content');check.type='checkbox';check.checked=task.done;check.setAttribute('aria-label',task.text+' 완료');li.classList.toggle('completed',task.done);
    const title=action(task.text,task.text+' 수정',()=>openEditor('task',task));title.className='text-edit';content.append(title,el('small','task-meta',timeLabel(task)+(task.weekly?' · 반복':'')));
    check.addEventListener('change',()=>{task.done=check.checked;if(task.weekly)extras.checks[`${key}/${task.id}`]=task.done;li.classList.toggle('completed',task.done);persist();renderCalendar();updateProgress();});
    const remove=action('×',task.text+(task.weekly?' 이 날짜만 제외':' 삭제'),()=>{if(task.weekly)extras.skipped[`${key}/${task.id}`]=true;else tasks[key]=(tasks[key]||[]).filter(t=>t.id!==task.id);finish();$('todo-input').focus();});remove.title=task.weekly?'이 날짜만 제외':'삭제';li.append(check,content,remove);$('todo-list').append(li);
  }
}
function renderExtras(){
  const key=dateKey(selected);$('note-date').textContent=selected.toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'long'});$('note-list').replaceChildren();$('note-empty').hidden=!!notesFor(key).length;
  for(const event of notesFor(key)){const row=el('li'),content=el('span');const title=action(event.text,event.text+' 수정',()=>openEditor('event',event));title.className='text-edit';content.append(title,el('small','task-meta',`${event.start} ~ ${event.end}`));row.append(content,action('×',event.text+' 전체 기간 삭제',()=>{if(event.start!==event.end&&!confirm('이 일정의 전체 기간을 삭제할까요?'))return;extras.events=extras.events.filter(e=>e.id!==event.id);finish();$('note-input').focus();}));$('note-list').append(row);}
  $('repeat-list').replaceChildren();
  for(const r of extras.rules.filter(r=>!r.end||r.end>=key)){
    const row=el('li'),content=el('span');const title=action(r.text,r.text+' 반복 수정',()=>openEditor('rule',r));title.className='text-edit';content.append(title,el('small','task-meta',`${r.days.map(d=>weekdays[d]).join('·')} / ${timeLabel(r)}\n${r.start} ~ ${r.end||'계속'}`));
    row.append(content,action('×',r.text+' 전체 반복 삭제',()=>{if(!confirm('이 반복의 모든 날짜와 완료 기록을 삭제할까요?'))return;extras.rules=extras.rules.filter(x=>x.id!==r.id);for(const map of [extras.checks,extras.skipped,extras.overrides])for(const k of Object.keys(map))if(k.endsWith('/'+r.id))delete map[k];finish();$('repeat-input').focus();}));$('repeat-list').append(row);
  }
}
function render(){renderCalendar();renderTodos();renderExtras();}
// Split a recurring series at a date; preserve past instances and move future records.
function updateFuture(rule,key,changes){
  const replacement={...rule,...changes,id:newId(),start:key};
  rule.end=dateKey(addDays(parseDate(key),-1));extras.rules.push(replacement);
  for(const map of [extras.checks,extras.skipped,extras.overrides])for(const k of Object.keys(map))if(k.endsWith('/'+rule.id)&&k.slice(0,10)>=key){if(map!==extras.overrides)map[k.slice(0,10)+'/'+replacement.id]=map[k];delete map[k];}
}
function openEditor(kind,item){
  const rule=kind==='rule'?item:item.weekly?extras.rules.find(r=>r.id===item.id):null;
  const key=rule&&kind==='rule'&&dateKey(selected)<rule.start?rule.start:dateKey(selected);
  editing={kind,item,rule,key};$('editor-title').textContent=kind==='event'?'날짜 표시 수정':'할 일 수정';$('edit-text').value=item.text;$('edit-error').textContent='';
  $('edit-times').hidden=kind==='event';$('edit-dates').hidden=kind!=='event';$('edit-repeat').hidden=!rule;
  $('edit-start-time').value=item.startTime||'';$('edit-end-time').value=item.endTime||'';$('edit-start').value=item.start||key;$('edit-end').value=item.end||key;
  $('edit-start').required=kind==='event';$('edit-end').required=kind==='event';
  if(rule){$('edit-scope').value=kind==='rule'?'future':'once';$('edit-scope').disabled=kind==='rule';$('edit-anchor').textContent=`적용 기준일: ${key}`;$('edit-until').value=rule.end||'';for(const e of document.querySelectorAll('input[name="edit-days"]'))e.checked=rule.days.includes(Number(e.value));}
  $('edit-rule-options').hidden=!rule||$('edit-scope').value==='once';$('editor').showModal();$('edit-text').focus();
}
$('edit-scope').addEventListener('change',()=>{$('edit-rule-options').hidden=$('edit-scope').value==='once';});
$('edit-cancel').addEventListener('click',()=>$('editor').close());
$('edit-form').addEventListener('submit',e=>{
  e.preventDefault();if(!editing)return;const {kind,item,rule,key}=editing,text=$('edit-text').value.trim();let error='';if(!text)error='내용을 입력하세요.';
  const changes={text,startTime:$('edit-start-time').value,endTime:$('edit-end-time').value};
  if(kind==='event'){const start=$('edit-start').value,end=$('edit-end').value;error ||= datesError(start,end);if(!error)Object.assign(item,{text,start,end});}
  else {error ||= timeError(changes.startTime,changes.endTime);
    if(rule&&$('edit-scope').value==='future'){
      const days=picks('edit-days'),end=$('edit-until').value;error ||= !days.length?'반복 요일을 하나 이상 선택하세요.':end&&(!validDate(end)||end<key)?'반복 종료일은 적용 기준일 이후여야 합니다.':'';
      if(!error)updateFuture(rule,key,{...changes,days,end});
    }else if(!error){if(rule)extras.overrides[`${key}/${rule.id}`]=changes;else Object.assign(item,changes);}
  }
  $('edit-error').textContent=error;if(error)return;$('editor').close();finish();
});
$('todo-form').addEventListener('submit',e=>{
  e.preventDefault();const text=$('todo-input').value.trim(),startTime=$('todo-start-time').value,endTime=$('todo-end-time').value,error=timeError(startTime,endTime)||(!text?'내용을 입력하세요.':'');$('todo-error').textContent=error;if(error)return;
  (tasks[dateKey(selected)] ||= []).push({id:newId(),text,done:false,startTime,endTime});$('todo-input').value='';$('todo-start-time').value='';$('todo-end-time').value='';finish();$('todo-input').focus();
});
$('repeat-form').addEventListener('submit',e=>{
  e.preventDefault();const text=$('repeat-input').value.trim(),days=picks('repeat-days'),end=$('repeat-end').value,startTime=$('repeat-start-time').value,endTime=$('repeat-end-time').value,start=dateKey(selected);
  const error=(!text?'내용을 입력하세요.':'')||timeError(startTime,endTime)||(!days.length?'요일을 하나 이상 선택하세요.':'')||(end&&(!validDate(end)||end<start)?'반복 종료일은 시작일 이후여야 합니다.':'');$('repeat-error').textContent=error;if(error)return;
  extras.rules.push({id:newId(),text,days,start,end,startTime,endTime});$('repeat-input').value='';finish();$('repeat-input').focus();
});
$('note-form').addEventListener('submit',e=>{
  e.preventDefault();const text=$('note-input').value.trim(),start=$('note-start').value,end=$('note-end').value,error=datesError(start,end)||(!text?'내용을 입력하세요.':'');$('note-error').textContent=error;if(error)return;
  extras.events.push({id:newId(),text,start,end});$('note-input').value='';selected=parseDate(start);displayed=new Date(selected.getFullYear(),selected.getMonth(),1);finish();$('note-input').focus();
});
$('prev').addEventListener('click',()=>{displayed=new Date(displayed.getFullYear(),displayed.getMonth()-1,1);renderCalendar();});$('next').addEventListener('click',()=>{displayed=new Date(displayed.getFullYear(),displayed.getMonth()+1,1);renderCalendar();});$('today-button').addEventListener('click',()=>{today=parseDate(dateKey(new Date()));selectDate(today);});
function refreshDate(){const now=parseDate(dateKey(new Date()));if(dateKey(now)!==dateKey(today)){today=now;render();}}
setInterval(refreshDate,30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshDate();});
$('note-start').value=dateKey(selected);$('note-end').value=dateKey(selected);render();
