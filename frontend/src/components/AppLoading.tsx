export function AppLoading() {
  return (
    <main className="app-loading" role="status" aria-live="polite">
      <div className="loading-wordmark">Movers Squad</div>
      <div className="loading-slots" aria-hidden="true">
        <span /><span /><span /><span />
      </div>
      <div className="loading-track" aria-hidden="true"><span /></div>
      <p>正在进入组队大厅</p>
    </main>
  )
}
