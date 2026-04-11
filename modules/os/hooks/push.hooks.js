async function onOSCreated(osData) {
  const pushService = require('../../push/push.service');

  if (['CRITICA', 'EMERGENCIAL', 'ALTA'].includes(osData.prioridade?.toUpperCase())) {
    await pushService.notifyNewOS(osData);
  }
}

async function onOSStatusChanged(osData, oldStatus, newStatus) {
  const pushService = require('../../push/push.service');
  await pushService.notifyOSStatusChange(osData, oldStatus, newStatus);
}

module.exports = { onOSCreated, onOSStatusChanged };
