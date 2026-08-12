import Link from "next/link";

export default function NotFound() {
  return (
    <main className="public-error">
      <span>Roadmap</span>
      <h1>This page is unavailable.</h1>
      <p>
        The address may be incomplete, private, expired, or removed. No private coaching
        information is shown here.
      </p>
      <Link href="/">Return to Roadmap</Link>
    </main>
  );
}
