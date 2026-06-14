/** Initial loading / splash screen shown while the app bootstraps. */
export function Splash() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-5 bg-surface">
      <div className="flex h-20 w-20 items-center justify-center rounded-hero bg-brand text-4xl shadow-glow">
        🏋️
      </div>
      <div className="text-center">
        <p className="eyebrow mb-1.5">MyRocky</p>
        <h1 className="h1 text-2xl">Gym Tracker</h1>
      </div>
      <div className="prog w-32">
        <span className="!w-1/2 animate-[loading_1s_ease-in-out_infinite]" />
      </div>
    </div>
  );
}
