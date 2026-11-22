'use strict';
(() => {
  const api = window.storeGate;
  const element = id => document.getElementById(id);
  const store = element('store'), retry = element('retry');
  function render(state) {
    if (!state) return;
    const busy = state.status === 'checking';
    store.disabled = retry.disabled = busy;
    element('symbol').textContent = busy ? '↻' : state.status === 'update_available' ? '↑' : '!';
    element('detail').textContent = state.code || '';
    if (state.status === 'update_available') {
      element('heading').textContent = 'لازم تحدّث التطبيق قبل الاستخدام';
      element('message').textContent = 'Microsoft Store أبلغ بوجود تحديث للتطبيق. حدّثه من المتجر، وبعد اكتمال التثبيت افتحه من جديد.';
      element('english').textContent = 'An update is required. Update in Microsoft Store, then reopen the app.';
      retry.textContent = 'إعادة الفحص';
    } else if (state.status === 'error') {
      element('heading').textContent = 'تعذّر التأكد من التحديث';
      element('message').textContent = 'اتأكد من الاتصال بالإنترنت وأن Microsoft Store شغّال، وبعدها أعد الفحص. التطبيق مش هيفتح قبل ما نقدر نتأكد.';
      element('english').textContent = 'Unable to check for updates. Connect to the internet and retry. The app remains locked.';
    } else {
      element('heading').textContent = 'جارٍ فحص تحديث التطبيق';
      element('message').textContent = 'بنتأكد من Microsoft Store قبل فتح التطبيق.';
      element('english').textContent = 'Checking Microsoft Store before opening the app.';
    }
  }
  store.addEventListener('click', () => api.openStore());
  retry.addEventListener('click', () => api.retry());
  element('exit').addEventListener('click', () => api.exit());
  api.onState(render);
  api.onOpenError(() => {
    element('message').textContent = 'تعذّر فتح Microsoft Store. افتحه من قائمة ابدأ وحدّث التطبيق من المكتبة، ثم افتح التطبيق من جديد.';
    element('english').textContent = 'Could not open Microsoft Store. Open it from Start and update from Library.';
  });
  api.state().then(render).catch(() => render({ status: 'error', code: 'gate_connection_error' }));
})();
