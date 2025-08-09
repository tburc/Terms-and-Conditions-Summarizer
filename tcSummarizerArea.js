// Handle receiving summaries and rendering them
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.showTerms) {
    const list = document.getElementById('terms-list');
    list.innerHTML = '';
    if (!msg.showTerms.length) {
      list.innerHTML = '<li>No Terms & Conditions or Privacy Policy links found on this page.</li>';
      return;
    }

    msg.showTerms.forEach(link => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = link.href;
      a.textContent = link.text || link.href;
      a.target = '_blank';
      a.style.fontSize = "1.2em";
      a.style.fontWeight = "bold";

      const summaryDiv = document.createElement('div');
      summaryDiv.style.marginTop = "5px";

      const summary = link.summary || "No summary available.";

      // --- Convert Markdown to HTML with better structure ---
      let html = summary
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/^### (.*)$/gm, "<h3>$1</h3>")
        .replace(/^## (.*)$/gm, "<h2>$1</h2>")
        .replace(/^# (.*)$/gm, "<h1>$1</h1>")
        .replace(/\n+/g, "\n");

      html = html.replace(/Pros:\s*([\s\S]*?)(?=(Cons:|Rating:|$))/i, (match, items) => {
        const lis = items
          .split(/\n|-/)
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .map(line => `<li>${line}</li>`)
          .join('');
        return `<div class="pros-bubble"><strong>Pros:</strong><ul class="pros">${lis}</ul></div>`;
      });

      html = html.replace(/Cons:\s*([\s\S]*?)(?=(Rating:|$))/i, (match, items) => {
        const lis = items
          .split(/\n|-/)
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .map(line => `<li>${line}</li>`)
          .join('');
        return `<div class="cons-bubble"><strong>Cons:</strong><ul class="cons">${lis}</ul></div>`;
      });

      html = html.replace(/Rating:\s*([0-9]\/10.*?)$/gmi,
        '<span class="rating">Rating: $1</span>');

      summaryDiv.classList.add("summary-card");
      summaryDiv.innerHTML = html;
      summaryDiv.style.whiteSpace = "normal";

      li.appendChild(a);
      li.appendChild(summaryDiv);
      list.appendChild(li);
    });
  }
});

// --- Tab switching + familiarity handling + question handling ---
document.addEventListener("DOMContentLoaded", () => {
  const questionsTab = document.getElementById("questions-tab");
  const settingsTab = document.getElementById("settings-tab");
  const callToActionTab = document.getElementById("call-to-action-tab");

  const questionsContent = document.getElementById("questions-content");
  const settingsContent = document.getElementById("settings-content");
  const callToActionContent = document.getElementById("call-to-action-content");

  const dropdown = document.getElementById("familiarity-dropdown");
  const askBtn = document.getElementById("ask-btn");
  const questionInput = document.getElementById("question-input");
  const questionResponse = document.getElementById("question-response");

  // Load saved familiarity
  chrome.storage.sync.get(["familiarityLevel"], (data) => {
    if (data.familiarityLevel) {
      dropdown.value = data.familiarityLevel;
    }
  });

  dropdown.addEventListener("change", () => {
    chrome.storage.sync.set({ familiarityLevel: dropdown.value });
  });

  // Tab switching
  questionsTab.addEventListener("click", () => {
    questionsContent.style.display = "block";
    settingsContent.style.display = "none";
    callToActionContent.style.display = "none";

    questionsTab.classList.add("active");
    settingsTab.classList.remove("active");
    callToActionTab.classList.remove("active");
  });

  settingsTab.addEventListener("click", () => {
    questionsContent.style.display = "none";
    settingsContent.style.display = "block";
    callToActionContent.style.display = "none";

    settingsTab.classList.add("active");
    questionsTab.classList.remove("active");
    callToActionTab.classList.remove("active");
  });

  callToActionTab.addEventListener("click", () => {
    questionsContent.style.display = "none";
    settingsContent.style.display = "none";
    callToActionContent.style.display = "block";

    callToActionTab.classList.add("active");
    questionsTab.classList.remove("active");
    settingsTab.classList.remove("active");
  });

  // Handle Ask button
  askBtn.addEventListener("click", () => {
    const question = questionInput.value.trim();
    if (!question) {
      questionResponse.textContent = "Please enter a question.";
      return;
    }
    questionResponse.textContent = "Loading...";
    chrome.runtime.sendMessage({ askQuestion: question }, (res) => {
      if (res && res.answer) {
        questionResponse.textContent = res.answer;
      } else {
        questionResponse.textContent = "No response from AI.";
      }
    });
  });
});
