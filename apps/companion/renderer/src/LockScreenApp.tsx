export function LockScreenApp() {
  return (
    <div className="flex items-center justify-center h-full bg-background">
      <div className="flex flex-col items-center gap-4 text-center p-6 select-none">
        <svg
          className="w-16 h-16 text-primary"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M18 10h-1V7a5 5 0 0 0-10 0v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zM9 7a3 3 0 0 1 6 0v3H9V7z" />
        </svg>
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-foreground">Attraccess Companion</h1>
          <p className="text-xl text-default-500">Session required</p>
          <p className="text-sm text-default-400 max-w-sm">
            This computer is locked. Authenticate via Attraccess to continue.
          </p>
        </div>
      </div>
    </div>
  );
}
