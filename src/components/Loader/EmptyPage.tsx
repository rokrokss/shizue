const EmptyPage = () => {
  return <div aria-busy="true" style={{
    width: '100%',
    minHeight: '100vh',
    background: 'var(--sz-panel-background, #1c1d26)',
  }} />;
};

export default EmptyPage;
