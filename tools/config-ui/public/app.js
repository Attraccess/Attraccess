/* eslint-disable @typescript-eslint/no-unused-vars -- Public handlers are called by HTML and sibling scripts. */
const API = '';

function request(method, url, body) {
  const opts = { method: method, headers: {} };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  return fetch(API + url, opts).then(function (r) {
    return r.json();
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ---- Tab switching ---- */
function switchTab(id) {
  document.querySelectorAll('.tab').forEach(function (t) {
    t.classList.remove('active');
  });
  document.querySelectorAll('.tab-content').forEach(function (c) {
    c.classList.remove('active');
  });
  document.querySelector('[onclick="switchTab(\'' + id + '\')"]').classList.add('active');
  document.getElementById('tab-' + id).classList.add('active');
}

/* ==================== DNS ==================== */
