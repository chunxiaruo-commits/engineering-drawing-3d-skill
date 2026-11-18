const $ = selector => document.querySelector(selector);
const questionNav = $('#questions');
const questions = project.questions;
const sheetButtons = [...document.querySelectorAll('[data-sheet]')];
const drawing = $('#drawing');
const source = $('#source-image');
const answerImage = $('#answer-image');
const sections = $('#sections');
const dialog = $('#drawing-dialog');
const dialogContent = $('#dialog-content');
let selected = -1;
let sheetMode = 'answer';
let diagramZoom = 1;

function selectSheet(mode) {
  const item = questions[selected];
  const original = mode === 'source' && Boolean(item.source);
  sheetMode = original ? 'source' : 'answer';
  drawing.hidden = original;
  source.hidden = !original;
  $('#legend').style.visibility = original ? 'hidden' : 'visible';
  if (original) source.src = item.source;
  for (const button of sheetButtons) {
    button.hidden = button.dataset.sheet === 'source' && !item.source;
    button.setAttribute('aria-pressed', String(button.dataset.sheet === sheetMode));
  }
}

function selectClip(key) {
  for (const button of sections.children) {
    button.setAttribute('aria-pressed', String(button.dataset.clip === key));
  }
  showModel(key);
}

function selectQuestion(index) {
  if (index === selected || index < 0 || index >= questions.length) return;
  selected = index;
  const item = questions[index];
  for (const [i, button] of [...questionNav.children].entries()) {
    if (i === index) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  }
  $('#question-code').textContent = item.number;
  $('#question-title').textContent = item.title;
  $('#question-prompt').textContent = item.prompt;
  $('#question-prompt').hidden = !item.prompt;
  answerImage.src = item.answer;
  answerImage.alt = item.title + '的参考图纸';
  source.alt = '第 ' + item.number + ' 题题目原图';
  $('#solution-notes').replaceChildren(...item.notes.map(note => {
    const li = document.createElement('li');
    li.textContent = note;
    return li;
  }));
  $('#notes-title').textContent = item.notes.length ? '作图要点' : '重建说明';
  const note = $('#reading-note');
  note.textContent = item.assumptions;
  note.hidden = !item.assumptions;
  $('.notes').hidden = item.notes.length === 0 && !item.assumptions;
  sections.hidden = !item.sections.length;
  document.body.dataset.sections = String(Boolean(item.sections.length));
  sections.replaceChildren(...(item.sections.length ? [{ model: item.model, label: '完整模型' }, ...item.sections].map(section => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.clip = section.model;
    button.textContent = section.label;
    button.addEventListener('click', () => selectClip(section.model));
    return button;
  }) : []));
  selectSheet('answer');
  selectClip(item.model);
}

$('#main-title').textContent = project.title;
$('.source-tag').textContent = questions.length + ' 题';
for (const [index, item] of questions.entries()) {
  const button = document.createElement('button');
  button.className = 'question-tab';
  button.type = 'button';
  button.setAttribute('aria-label', '第 ' + item.number + ' 题 ' + item.title);
  const number = document.createElement('span');
  number.className = 'nav-number';
  number.setAttribute('aria-hidden', 'true');
  number.textContent = item.number;
  button.append(number, item.tab || '第 ' + item.number + ' 题');
  button.addEventListener('click', () => {
    if (location.hash !== '#q' + (index+1)) history.pushState(null, '', '#q' + (index+1));
    selectQuestion(index);
  });
  questionNav.append(button);
}

function fromHash() {
  const match = /^#q([1-9]\d*)$/.exec(location.hash);
  const number = match ? Number(match[1]) : 1;
  selectQuestion(number > questions.length ? 0 : number-1);
}
for (const event of ['popstate', 'hashchange']) window.addEventListener(event, fromHash);
for (const button of sheetButtons) button.addEventListener('click', () => selectSheet(button.dataset.sheet));

function updateDiagramZoom() {
  dialogContent.style.width = diagramZoom*100 + '%';
  $('#dialog-smaller').disabled = diagramZoom <= 1;
  $('#dialog-larger').disabled = diagramZoom >= 3;
}
$('#expand-drawing').addEventListener('click', () => {
  diagramZoom = 1;
  $('#dialog-title').textContent = '第 ' + questions[selected].number + ' 题 · ' + (sheetMode === 'answer' ? '参考答案' : '题目原图');
  const image = (sheetMode === 'answer' ? answerImage : source).cloneNode();
  image.removeAttribute('id');
  image.hidden = false;
  dialogContent.replaceChildren(image);
  updateDiagramZoom();
  dialog.showModal();
  $('#dialog-sheet').scrollTo(0, 0);
});
$('#dialog-smaller').addEventListener('click', () => { diagramZoom=clamp(diagramZoom-.35,1,3); updateDiagramZoom(); });
$('#dialog-larger').addEventListener('click', () => { diagramZoom=clamp(diagramZoom+.35,1,3); updateDiagramZoom(); });
dialog.addEventListener('close', () => dialogContent.replaceChildren());
fromHash();
