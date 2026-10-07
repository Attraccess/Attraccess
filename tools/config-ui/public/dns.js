/* eslint-disable @typescript-eslint/no-unused-vars -- Public handlers are called by HTML and sibling scripts. */
function renderDnsRecords(records) {
  const tbody = document.getElementById('dns-records-table');
  const empty = document.getElementById('dns-empty-state');
  if (!records.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = records
    .map(function (r) {
      return (
        '<tr data-id="' +
        escapeHtml(r.id) +
        '">' +
        '<td><span class="cell-text">' +
        escapeHtml(r.hostname) +
        '</span>' +
        '<input class="edit-input edit-hostname" style="display:none" value="' +
        escapeHtml(r.hostname) +
        '"></td>' +
        '<td><span class="cell-text">' +
        escapeHtml(r.ip) +
        '</span>' +
        '<input class="edit-input edit-ip" style="display:none" value="' +
        escapeHtml(r.ip) +
        '"></td>' +
        '<td class="actions">' +
        '<button class="btn-secondary btn-edit" onclick="startDnsEdit(this)" data-testid="btn-edit-record">Edit</button>' +
        '<button class="btn-primary btn-save" style="display:none" onclick="saveDnsEdit(this)" data-testid="btn-save-record">Save</button>' +
        '<button class="btn-secondary btn-cancel" style="display:none" onclick="loadDnsRecords()" data-testid="btn-cancel-edit">Cancel</button>' +
        '<button class="btn-danger btn-delete" onclick="deleteDnsRecord(\'' +
        escapeHtml(r.id) +
        '\')" data-testid="btn-delete-record">Delete</button>' +
        '</td></tr>'
      );
    })
    .join('');
}

function loadDnsRecords() {
  request('GET', '/api/modules/dnsmasq/records').then(renderDnsRecords);
}

function addDnsRecord() {
  const hostname = document.getElementById('new-hostname').value.trim();
  const ip = document.getElementById('new-ip').value.trim();
  if (!hostname || !ip) return;
  request('POST', '/api/modules/dnsmasq/records', { hostname: hostname, ip: ip }).then(function () {
    document.getElementById('new-hostname').value = '';
    document.getElementById('new-ip').value = '';
    loadDnsRecords();
  });
}

function deleteDnsRecord(id) {
  if (!confirm('Delete this DNS record?')) return;
  request('DELETE', '/api/modules/dnsmasq/records/' + id).then(loadDnsRecords);
}

function startDnsEdit(btn) {
  const row = btn.closest('tr');
  row.querySelectorAll('.cell-text').forEach(function (el) {
    el.style.display = 'none';
  });
  row.querySelectorAll('.edit-input').forEach(function (el) {
    el.style.display = 'block';
  });
  row.querySelector('.btn-edit').style.display = 'none';
  row.querySelector('.btn-save').style.display = '';
  row.querySelector('.btn-cancel').style.display = '';
}

function saveDnsEdit(btn) {
  const row = btn.closest('tr');
  const id = row.getAttribute('data-id');
  const hostname = row.querySelector('.edit-hostname').value.trim();
  const ip = row.querySelector('.edit-ip').value.trim();
  if (!hostname || !ip) return;
  request('PUT', '/api/modules/dnsmasq/records/' + id, { hostname: hostname, ip: ip }).then(loadDnsRecords);
}

function loadDnsSettings() {
  request('GET', '/api/modules/dnsmasq/settings').then(function (s) {
    document.getElementById('dns-upstream1').value = s.upstream1 || '';
    document.getElementById('dns-upstream2').value = s.upstream2 || '';
    document.getElementById('dns-localDomain').value = s.localDomain || '';
    document.getElementById('dns-logQueries').checked = !!s.logQueries;
  });
}

function saveDnsSettings() {
  const data = {
    upstream1: document.getElementById('dns-upstream1').value.trim(),
    upstream2: document.getElementById('dns-upstream2').value.trim(),
    localDomain: document.getElementById('dns-localDomain').value.trim(),
    logQueries: document.getElementById('dns-logQueries').checked,
  };
  request('PUT', '/api/modules/dnsmasq/settings', data).then(loadDnsSettings);
}

function checkDnsStatus() {
  request('GET', '/api/modules/dnsmasq/status')
    .then(function (s) {
      const el = document.getElementById('dns-status');
      const text = document.getElementById('dns-status-text');
      if (s.running) {
        el.className = 'status-bar running';
        text.textContent = 'dnsmasq running (PID ' + s.pid + ')';
      } else {
        el.className = 'status-bar stopped';
        text.textContent = 'dnsmasq not running';
      }
    })
    .catch(function () {
      document.getElementById('dns-status').className = 'status-bar stopped';
      document.getElementById('dns-status-text').textContent = 'Connection error';
    });
}

/* ==================== Prometheus ==================== */
