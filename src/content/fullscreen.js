// No URLs or page content are collected here. The top-frame focus guard also
// covers tabs visible in split views; fullscreenElement includes fullscreen iframes.
(() => {
  const probe = () => ({ fullscreen: Boolean(document.fullscreenElement), focused: document.hasFocus() });
  const notify = () => {
    try { chrome.runtime.sendMessage({ type: 'page-state' }).catch(() => {}); }
    catch { /* An extension reload invalidates existing content scripts. */ }
  };
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type === 'probe') respond(probe());
  });
  document.addEventListener('fullscreenchange', notify);
  document.addEventListener('visibilitychange', notify);
  window.addEventListener('focus', notify);
  window.addEventListener('blur', notify);
  window.addEventListener('pageshow', notify);
  notify();
})();
