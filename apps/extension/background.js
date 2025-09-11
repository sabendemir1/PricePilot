// Fetch raw HTML for a given URL and save to html.txt (test only)
// After webSearch, fetch HTML for the first link and trigger download in content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
	// DuckDuckGo search
	if (msg && msg.type === 'PP_WEB_SEARCH' && msg.query) {
		webSearch(msg.query, msg.limit || 10).then(results => {
			sendResponse({ ok: true, results });
		}).catch(err => {
			sendResponse({ ok: false, error: String(err) });
		});
		return true;
	}
	// Fetch HTML for a given URL
	if (msg && msg.type === 'PP_FETCH_HTML' && msg.url) {
		fetch(msg.url)
			.then(response => response.text())
			.then(html => {
				// Send to the tab that requested the fetch
				const tabId = sender.tab && sender.tab.id ? sender.tab.id : null;
				if (tabId) {
					chrome.tabs.sendMessage(tabId, { type: 'PP_SAVE_HTML', html, idx: msg.idx });
				} else {
					// fallback: send to active tab
					chrome.tabs.query({active: true, currentWindow: true}, tabs => {
						if (tabs[0]) {
							chrome.tabs.sendMessage(tabs[0].id, { type: 'PP_SAVE_HTML', html, idx: msg.idx });
						}
					});
				}
				sendResponse({ ok: true, html });
			})
			.catch(err => {
				sendResponse({ ok: false, error: String(err) });
			});
		return true;
	}
});
// Background service worker
// Performs search on DuckDuckGo in a temporary tab and returns top results.

async function webSearch(query, limit = 10) {
	return new Promise((resolve) => {
		try {
			chrome.tabs.create({ url: "https://duckduckgo.com/?q=" + encodeURIComponent(query), active: false }, (tab) => {
				if (!tab || !tab.id) return resolve([]);
				const tabId = tab.id;
				function handleUpdated(updatedTabId, info) {
					if (updatedTabId === tabId && info.status === "complete") {
						chrome.tabs.onUpdated.removeListener(handleUpdated);
						chrome.scripting.executeScript({
							target: { tabId },
							func: () => {
								let links = [...document.querySelectorAll('a[data-testid="result-title-a"]')];
								if (links.length === 0) {
									links = [...document.querySelectorAll('.result__a')];
								}
								return links.map(a => ({ title: a.textContent.trim(), url: a.href }));
							}
						}, (results) => {
							//chrome.tabs.remove(tabId);
							if (chrome.runtime.lastError || !results || !results[0]) {
								resolve([]);
							} else {
								const out = (results[0].result || []).slice(0, limit);
								resolve(out);
							}
						});
					}
				}
				chrome.tabs.onUpdated.addListener(handleUpdated);
			});
		} catch (e) {
			console.error('webSearch error', e);
			resolve([]);
		}
	});
}

// Optional: expose for debugging via DevTools console (if service worker context persists)
self.webSearch = webSearch;