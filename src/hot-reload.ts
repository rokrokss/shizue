if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => {
    chrome.runtime.reload();
  });
}
