// ===== Cloudflare Worker base URL (no trailing slash) =====
const WORKER_BASE = "YOUR_WORKER";

// In-memory cache of cleaned policy text used for summaries
let LAST_POLICY_TEXT = "";

// -------- helper: summarize via Worker ----------
async function summarizeText(text, familiarityLevel) {
  const resp = await fetch(`${WORKER_BASE}/summarize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: text.slice(0, 4000),
      familiarityLevel: familiarityLevel || "none",
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error("Summarize worker error:", data);
    return `Summary failed (${data.error || resp.status})`;
  }
  return data.content || "Summary failed (no content)";
}

// Persist cache so Ask works even after service worker restarts
function setPersistedPolicyText(text) {
  LAST_POLICY_TEXT = text || "";
  try {
    chrome.storage.local.set({ lastPolicyText: LAST_POLICY_TEXT });
  } catch {}
}
async function getPersistedPolicyText() {
  if (LAST_POLICY_TEXT && LAST_POLICY_TEXT.trim()) return LAST_POLICY_TEXT;
  const data = await new Promise((resolve) =>
    chrome.storage.local.get(["lastPolicyText"], resolve)
  );
  return (data.lastPolicyText || "").toString();
}

// -------- Chrome Action: open side panel + summarize ----------
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel
    .open({ tabId: tab.id })
    .then(() => {
      chrome.tabs.sendMessage(tab.id, { collectLinks: true }, async (response) => {
        if (!response || !response.links) return;

        // Fetch familiarity level from storage
        chrome.storage.sync.get(["familiarityLevel"], async (data) => {
          const familiarityLevel = data.familiarityLevel || "none";

          const cleanedTexts = []; // collect all cleaned texts for caching

          const results = await Promise.all(
            response.links.map(async (link) => {
              try {
                const res = await fetch(link.href);
                const html = await res.text();
                const cleanText = html
                  .replace(/<script[\s\S]*?<\/script>/gi, "")
                  .replace(/<style[\s\S]*?<\/style>/gi, "")
                  .replace(/<[^>]+>/g, " ")
                  .replace(/\s+/g, " ")
                  .trim();

                if (cleanText) cleanedTexts.push(cleanText);

                const summary = await summarizeText(cleanText, familiarityLevel);
                return { ...link, summary };
              } catch (e) {
                console.error("Fetch/summarize error:", e);
                return { ...link, summary: "Failed to fetch or summarize terms content." };
              }
            })
          );

          // Update caches with the exact text we summarized
          const joined = cleanedTexts.join("\n\n");
          setPersistedPolicyText(joined);
          try {
            console.log("Cached policy text length:", joined.length);
          } catch {}

          chrome.runtime.sendMessage({ showTerms: results });
        });
      });
    })
    .catch((err) => console.error("Failed to open panel:", err));
});

// -------- Ask Questions plumbing ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.askQuestion) {
    handleAskQuestion(msg.askQuestion).then((answer) => {
      sendResponse({ answer });
    });
    return true; // keep the channel open
  }
});

function getFamiliarity() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["familiarityLevel"], (data) => {
      resolve(data.familiarityLevel || "none");
    });
  });
}

// Call the Worker /ask endpoint
async function askViaWorker(question, combinedText, familiarityLevel) {
  const trimmed = (combinedText || "").slice(0, 30000);
  console.log("Q&A sending length to worker:", trimmed.length);
  const resp = await fetch(`${WORKER_BASE}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      combinedText: trimmed, // worker trims further if needed
      familiarityLevel: familiarityLevel || "none",
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error("Ask worker error:", resp.status, data);
    if (resp.status === 422 && data && typeof data.receivedChars !== "undefined") {
      return `Couldn’t read the policy text on this site (received ${data.receivedChars} chars). Try opening the policy page directly and running the summary again.`;
    }
    return `Failed to get an answer (${data.error || resp.status}).`;
  }
  return data.content || "Failed to get an answer.";
}

// Fallback: grab visible text from the current page (as a last resort)
async function getVisiblePageText(tabId) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // Basic visible text scrape
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
        let out = "";
        while (walker.nextNode()) {
          const t = walker.currentNode.nodeValue;
          if (t && t.trim().length > 0) out += t + " ";
        }
        return out.replace(/\s+/g, " ").trim();
      },
    });
    return (result || "").toString();
  } catch (e) {
    console.error("Visible text scrape failed:", e);
    return "";
  }
}

async function handleAskQuestion(question) {
  try {
    const familiarityLevel = await getFamiliarity();

    // 1) Use persisted cache first (same exact text as summaries)
    let policyText = await getPersistedPolicyText();
    if (policyText && policyText.trim().length > 0) {
      console.log("Using cached policy text for Q&A. Length:", policyText.length);
      return await askViaWorker(question, policyText, familiarityLevel);
    }

    // 2) Fallback: re-collect from links (for users who ask before running summary)
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const linksResponse = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { collectLinks: true }, resolve);
    });

    const links = linksResponse?.links || [];
    if (links.length) {
      const texts = await Promise.all(
        links.map(async (link) => {
          try {
            const res = await fetch(link.href);
            const html = await res.text();
            return html
              .replace(/<script[\s\S]*?<\/script>/gi, "")
              .replace(/<style[\s\S]*?<\/style>/gi, "")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim();
          } catch {
            return "";
          }
        })
      );
      policyText = texts.filter(Boolean).join("\n\n");
      if (policyText.trim().length > 0) {
        // hydrate caches so future questions are immediate
        setPersistedPolicyText(policyText);
        console.log("Using fetched link text for Q&A. Length:", policyText.length);
        return await askViaWorker(question, policyText, familiarityLevel);
      }
    }

    // 3) Last resort: visible text from current page
    const visible = await getVisiblePageText(tab.id);
    if (visible && visible.length > 500) {
      console.log("Using visible page text fallback. Length:", visible.length);
      return await askViaWorker(question, visible, familiarityLevel);
    }

    return "Couldn’t read the policy text on this site. Try opening the policy or privacy page itself and click the extension again to build the summary first.";
  } catch (e) {
    console.error(e);
    return "Failed to process question.";
  }
}
