if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => {
    try {
      chrome.runtime.reload();
    } catch (e) {
      console.info('[HMR] context invalidated, ignored.');
    }
  });
}
