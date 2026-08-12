"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <main className="public-error">
      <span>Roadmap</span>
      <h1>This page could not be loaded.</h1>
      <p>
        Your last confirmed action may still have completed. Try once more before
        repeating a payment, publish, or deletion request.
      </p>
      <button type="button" onClick={reset}>
        Try again
      </button>
      <a href="/support">Get support guidance</a>
    </main>
  );
}
