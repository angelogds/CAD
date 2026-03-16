const { EventEmitter } = require('events');

const bus = new EventEmitter();
const clients = new Map();

function subscribe(channel, res) {
  if (!clients.has(channel)) clients.set(channel, new Set());
  clients.get(channel).add(res);
}

function unsubscribe(channel, res) {
  const set = clients.get(channel);
  if (!set) return;
  set.delete(res);
}

function publish(eventName, payload) {
  bus.emit(eventName, payload);
  const msg = `event: ${eventName}\ndata: ${JSON.stringify(payload || {})}\n\n`;
  for (const set of clients.values()) {
    for (const res of set) {
      try { res.write(msg); } catch (_e) {}
    }
  }
}

function clearAllClients() {
  for (const set of clients.values()) {
    for (const res of set) {
      try { res.end(); } catch (_e) {}
    }
  }
  clients.clear();
}

module.exports = { subscribe, unsubscribe, publish, bus, clearAllClients };
