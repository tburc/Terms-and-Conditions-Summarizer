document.addEventListener("click", () => {
  chrome.runtime.sendMessage({ openPanel: true });
});