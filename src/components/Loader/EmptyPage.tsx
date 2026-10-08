const EmptyPage = () => {
  return <div className="sz-panel-loading" role="status" aria-label="Loading Shizue" aria-busy="true" style={{
    width: '100%',
    minHeight: '100vh',
    background: 'var(--sz-panel-background, #1c1d26)',
  }}>
    <div className="sz-panel-loading-brand" aria-hidden="true">Shizue</div>
    <div className="sz-panel-loading-lines" aria-hidden="true">
      <div className="sz-panel-loading-line" />
      <div className="sz-panel-loading-line" />
    </div>
    <div className="sz-panel-loading-input" aria-hidden="true" />
  </div>;
};

export default EmptyPage;
