type TvShellProps = {
  children: React.ReactNode;
};

export function TvShell({ children }: TvShellProps) {
  return (
    <div className="tv-shell">
      <div className="tv-shell__frame">
        <header className="tv-topbar">
          <div className="tv-brand" aria-label="TipParta">
            <span className="tv-brand__mark">TipParta</span>
            <span className="tv-brand__edition">Pauza</span>
          </div>
        </header>
        <div className="tv-screen">{children}</div>
      </div>
    </div>
  );
}
