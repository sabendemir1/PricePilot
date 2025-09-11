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
	if (msg && msg.type === 'PP_FETCH_HTML' && msg.url) {
		(async () => {
			try {
			const res = await fetch(msg.url, { redirect: 'follow', credentials: 'omit' });
			if (!res.ok) throw new Error(`HTTP ${res.status} at ${msg.url}`);
			const html = await res.text();

			// --- robust UTF-8 → base64 (works in MV3 SW)
			const utf8 = new TextEncoder().encode(html);
			let bin = '';
			for (let i = 0; i < utf8.length; i++) bin += String.fromCharCode(utf8[i]);
			const base64 = btoa(bin);

			const filename = `html_${(msg.idx ?? 0) + 1}.txt`;
			chrome.downloads.download(
				{
				url: `data:text/plain;charset=utf-8;base64,${base64}`,
				filename,
				saveAs: false,
				conflictAction: 'overwrite'
				},
				(downloadId) => {
				if (chrome.runtime.lastError) {
					console.error('downloads.download error:', chrome.runtime.lastError.message);
					sendResponse({ ok: false, error: chrome.runtime.lastError.message });
					return;
				}
				// optional feedback to the tab
				const tabId = sender?.tab?.id;
				if (tabId) chrome.tabs.sendMessage(tabId, { type: 'PP_HTML_SAVED', idx: msg.idx, downloadId });
				sendResponse({ ok: true, idx: msg.idx, downloadId });
				}
			);
			} catch (err) {
			console.error('PP_FETCH_HTML fetch error:', err);
			sendResponse({ ok: false, error: String(err) });
			}
		})();
  	return true; // keep channel open
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
							chrome.tabs.remove(tabId);
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