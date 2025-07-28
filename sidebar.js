chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.openPanel && sender.tab) {
    chrome.sidePanel.open({ tabId: sender.tab.id });
  }
});