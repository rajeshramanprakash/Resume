(function () {
  'use strict';

  var API_URL = 'https://invoice-pdf-engine.onrender.com/api/v1/invoices/generate-pdf';
  var MAX_ITEMS = 20;
  var TIMEOUT_MS = 90000;

  var form = document.getElementById('invoice-demo-form');
  if (!form) return;

  var itemsBox = document.getElementById('demo-items');
  var addButton = document.getElementById('demo-add-item');
  var submitButton = document.getElementById('demo-submit');
  var statusBox = document.getElementById('demo-status');

  function itemRows() {
    return itemsBox.querySelectorAll('.demo-item');
  }

  function refreshItemControls() {
    var rows = itemRows();
    rows.forEach(function (row) {
      row.querySelector('.demo-remove').disabled = rows.length === 1;
    });
    addButton.disabled = rows.length >= MAX_ITEMS;
  }

  addButton.addEventListener('click', function () {
    var template = itemRows()[0];
    var row = template.cloneNode(true);
    row.querySelectorAll('input').forEach(function (input) {
      input.value = input.name === 'quantity' ? '1' : '';
    });
    itemsBox.appendChild(row);
    row.querySelector('input').focus();
    refreshItemControls();
  });

  itemsBox.addEventListener('click', function (event) {
    var button = event.target.closest('.demo-remove');
    if (!button || itemRows().length === 1) return;
    button.closest('.demo-item').remove();
    refreshItemControls();
  });

  function showStatus(type, message, details) {
    statusBox.className = 'demo-status demo-status-' + type;
    statusBox.textContent = message;

    if (details && details.length) {
      var list = document.createElement('ul');
      details.forEach(function (text) {
        var li = document.createElement('li');
        li.textContent = text;
        list.appendChild(li);
      });
      statusBox.appendChild(list);
    }
  }

  function numberOrNull(value) {
    return value.trim() === '' ? null : Number(value);
  }

  function buildPayload() {
    return {
      invoice_number: form.elements.invoice_number.value.trim(),
      client_name: form.elements.client_name.value.trim(),
      client_email: form.elements.client_email.value.trim(),
      client_address: form.elements.client_address.value.trim(),
      tax_percent: numberOrNull(form.elements.tax_percent.value),
      items: Array.prototype.map.call(itemRows(), function (row) {
        return {
          description: row.querySelector('[name="description"]').value.trim(),
          quantity: numberOrNull(row.querySelector('[name="quantity"]').value),
          unit_price: numberOrNull(row.querySelector('[name="unit_price"]').value)
        };
      })
    };
  }

  function downloadBlob(blob, invoiceNumber) {
    var safeNumber = invoiceNumber.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'invoice-' + safeNumber + '.pdf';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  function validationMessages(body) {
    var errors = (body && body.errors) || {};
    return Object.keys(errors).map(function (field) {
      var match = field.match(/^items\.(\d+)\./);
      var prefix = match ? 'Item ' + (Number(match[1]) + 1) + ': ' : '';
      return prefix + errors[field][0];
    });
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    var payload = buildPayload();
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
    var wakeNotice = setTimeout(function () {
      showStatus('info', 'Waking up the server (free tier). This can take up to a minute…');
    }, 4000);

    submitButton.disabled = true;
    showStatus('info', 'Generating your PDF…');

    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    })
      .then(function (response) {
        if (response.ok) {
          return response.blob().then(function (blob) {
            downloadBlob(blob, payload.invoice_number);
            showStatus('success', 'Done! Your invoice PDF has been downloaded.');
          });
        }

        if (response.status === 422) {
          return response.json().then(function (body) {
            showStatus('error', 'Please fix the following:', validationMessages(body));
          });
        }

        if (response.status === 429) {
          showStatus('error', 'Too many requests. Please wait a minute and try again.');
          return;
        }

        showStatus('error', 'The server returned an error (' + response.status + '). Please try again shortly.');
      })
      .catch(function (error) {
        showStatus('error', error.name === 'AbortError'
          ? 'The server took too long to respond. Please try again.'
          : 'Could not reach the server. Check your connection and try again.');
      })
      .finally(function () {
        clearTimeout(timeout);
        clearTimeout(wakeNotice);
        submitButton.disabled = false;
      });
  });

  refreshItemControls();
})();
