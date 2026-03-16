const test = require('node:test');
const assert = require('node:assert/strict');

const alertsService = require('../modules/alerts/alerts.service');
const controller = require('../modules/dashboard/dashboard.controller');

test('dashboard reconhecerAlerta returns json success', () => {
  const old = alertsService.reconhecerAlerta;
  alertsService.reconhecerAlerta = () => ({ ok: true, os_id: 99 });

  const req = {
    body: { os_id: 99 },
    session: { user: { id: 1 } },
  };
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };

  controller.reconhecerAlerta(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.os_id, 99);

  alertsService.reconhecerAlerta = old;
});
