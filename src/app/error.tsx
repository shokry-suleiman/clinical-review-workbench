"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center px-6">
      <p className="text-sm font-bold uppercase tracking-[0.16em] text-primary">
        Clinical Review Workbench
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink">
        This demo encountered an unexpected error.
      </h1>
      <p className="mt-3 max-w-lg leading-7 text-muted">
        No draft findings were confirmed. You can try loading the page again.
      </p>
      <button
        className="mt-6 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
        onClick={() => reset()}
        type="button"
      >
        Try again
      </button>
    </main>
  );
}
