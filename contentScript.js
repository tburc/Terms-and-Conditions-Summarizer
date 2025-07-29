chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.collectLinks) {
    const links = Array.from(document.querySelectorAll('a')).filter(link =>
      /(terms|conditions|terms of service|terms & conditions|privacy)/i.test(link.innerText)
    );
    const linkData = links.map(l => ({ text: l.innerText.trim(), href: l.href }));
    sendResponse({ links: linkData });
  }
  return true; // keep the channel open
});





