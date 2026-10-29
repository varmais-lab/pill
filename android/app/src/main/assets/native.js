'use strict';
(() => {
  const phone = window.TabletAndroid;
  if (!phone) return;
  const button = document.querySelector('#notify');
  button.textContent = '🔔 Enable phone reminders';
  button.onclick = () => phone.enableReminders();

  const statusCard = document.createElement('div');
  statusCard.className = 'card';
  statusCard.style.marginTop = '20px';
  statusCard.innerHTML = '<b>Phone reminders</b><p class="note" id="phoneReminderStatus" role="status"></p><div class="actions" style="width:auto;padding:0"><button class="smallbtn" id="testPhoneReminder">Test notification</button><button class="smallbtn" id="phoneSettings">Reminder settings</button><button class="smallbtn danger" id="disablePhoneReminders">Turn off reminders</button></div>';
  document.querySelector('#today').insertBefore(statusCard, document.querySelector('#today .foot'));
  document.querySelector('#testPhoneReminder').onclick = () => phone.testNotification();
  document.querySelector('#phoneSettings').onclick = () => phone.settings();
  document.querySelector('#disablePhoneReminders').onclick = () => phone.disableReminders();
  window.refreshAndroidStatus = () => {
    const status = JSON.parse(phone.reminderStatus());
    let text = status.enabled ? 'Phone reminders are enabled.' : 'Phone reminders are off. Tap Enable phone reminders to begin.';
    if (status.enabled && !status.notificationsAllowed) text = 'Notifications are blocked in Android settings.';
    else if (status.enabled) {
      text += status.exactAllowed ? ' Precise alarm access is available.' : ' Flexible timing: Android may delay delivery. Allow precise timing in Reminder settings for closer timing.';
      if (status.next) text += ' Next reminder: ' + status.next + '.';
    }
    document.querySelector('#phoneReminderStatus').textContent = text;
    document.querySelector('#disablePhoneReminders').disabled = !status.enabled;
    button.textContent = status.enabled ? '🔔 Check reminder permissions' : '🔔 Enable phone reminders';
  };
  // Update overdue-day labels and dose state when reopening a notification or returning to the app.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { refresh().catch(error => toast(error.message)); window.refreshAndroidStatus(); }
  });
  window.refreshAndroidStatus();
})();
