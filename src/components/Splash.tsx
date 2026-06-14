/** Initial loading / splash screen shown while the app bootstraps. */
export function Splash() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-7 bg-surface px-8">
      <img src="/Forma-logo.png" alt="Forma" className="w-72 max-w-[78%] rounded-2xl" />
      <div className="prog w-32">
        <span className="!w-1/2 animate-[loading_1s_ease-in-out_infinite]" />
      </div>
    </div>
  );
}
