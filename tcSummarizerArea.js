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
      // Render bullet points & line breaks nicely
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



    summaryDiv.innerHTML = html;
    summaryDiv.style.whiteSpace = "normal";


    summaryDiv.innerHTML = html;
    summaryDiv.style.whiteSpace = "normal"; // allow wrapping

      li.appendChild(a);
      li.appendChild(summaryDiv);
      list.appendChild(li);
    });
  }
});

