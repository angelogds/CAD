const test = require('node:test');
const assert = require('node:assert/strict');

const hub = require('../modules/alerts/alerts.hub');

test('alerts hub publishes SSE payload to subscribed client', () => {
  let output = '';
  const fakeRes = {
    write(chunk) { output += chunk; },
    end() {},
  };

  hub.subscribe('dashboard', fakeRes);
  hub.publish('nova_os_emergencial', { id_os: 10, prioridade: 'EMERGENCIAL' });
  hub.unsubscribe('dashboard', fakeRes);

  assert.ok(output.includes('event: nova_os_emergencial'));
  assert.ok(output.includes('"id_os":10'));
});
