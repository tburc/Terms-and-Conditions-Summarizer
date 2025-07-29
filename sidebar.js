const OPENAI_API_KEY = "sk-proj-YOUDIDNTTHINKYOUDGETTHISSOEASILYHACKER"; // secure key

async function summarizeText(text) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "user", content: `Summarize this text in under 50 words for a smart everyday user, while highlighting the privacy concerns. Format strictly as: Pros: - [pro point] - [pro point] Cons: - [con point] - [con point] Rating: [X/10] [reasoning in one sentence] Do not include any other headings, summaries, or introductory text. ${text}` }
      ],
      temperature: 0.7
    })
  });

  const data = await response.json();
  console.log("OpenAI raw response:", data);

  if (data.error) {
    return `Summary failed (OpenAI error: ${data.error.message})`;
  }
  if (!data.choices || !data.choices.length) {
    return "Summary failed (no choices returned)";
  }
  return data.choices[0].message?.content || "Summary failed (no content)";
}


chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id }).then(() => {
    chrome.tabs.sendMessage(tab.id, { collectLinks: true }, async (response) => {
      if (!response || !response.links) return;

      const results = await Promise.all(response.links.map(async (link) => {
        try {
          const res = await fetch(link.href);
          const html = await res.text();
          const cleanText = html
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();

          const summary = await summarizeText(cleanText.slice(0, 4000));
          return { ...link, summary };
        } catch (e) {
          return { ...link, summary: "Failed to fetch or summarize terms content." };
        }
      }));

      chrome.runtime.sendMessage({ showTerms: results });
    });
  }).catch(err => console.error("Failed to open panel:", err));
});


