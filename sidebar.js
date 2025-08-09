

async function summarizeText(text, familiarityLevel) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `Knowledge level is: ${familiarityLevel}. Tailor your response directly directly based on this knowledge level.
Summarize this text in under 170 words, highlighting the privacy concerns, but also be extremely extremely detailed and don't be generic at all. NEVER SAY THINGS LIKE: "raises concerns about data privacy", "Lacks transparency", "promoting accesability", "various privacy concerns" or other general terminology or similar phrases. Do NOT use ANY external knowledge about the company/website in question that may bias results. ONLY use the policies. Format strictly as: Pros: - [pro point] - [pro point] Cons: - [con point] - [con point] Rating: [X/10] [reasoning in one sentence] Do not include any other headings, summaries, or introductory text. ${text}`
        }
      ],
      temperature: 0.6
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

      // Fetch familiarity level from storage
      chrome.storage.sync.get(["familiarityLevel"], async (data) => {
        const familiarityLevel = data.familiarityLevel || "none";

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

            const summary = await summarizeText(cleanText.slice(0, 4000), familiarityLevel);
            return { ...link, summary };
          } catch (e) {
            return { ...link, summary: "Failed to fetch or summarize terms content." };
          }
        }));

        chrome.runtime.sendMessage({ showTerms: results });
      });
    });
  }).catch(err => console.error("Failed to open panel:", err));
});


chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.askQuestion) {
    handleAskQuestion(msg.askQuestion).then(answer => {
      sendResponse({ answer });
    });
    return true; // keeps the channel open
  }
});

function getFamiliarity() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["familiarityLevel"], (data) => {
      resolve(data.familiarityLevel || "none");
    });
  });
}

async function handleAskQuestion(question) {
  try {
    const familiarityLevel = await getFamiliarity();

    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Collect all policy links (same as summary process)
    const linksResponse = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { collectLinks: true }, resolve);
    });

    const links = linksResponse?.links || [];
    if (!links.length) return "No policy links found to answer from.";

    // Fetch and clean all link texts
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

    const combinedText = texts.filter(Boolean).join("\n\n");

    const prompt = `Knowledge level is: ${familiarityLevel}. Limit your answer to 100 words.
Answer the following question based ONLY on these policy texts:
${combinedText.slice(0, 12000)}
Question: ${question}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5
      })
    });

    const data = await response.json();
    return data?.choices?.[0]?.message?.content || "Failed to get an answer.";
  } catch (e) {
    console.error(e);
    return "Failed to process question.";
  }
}
