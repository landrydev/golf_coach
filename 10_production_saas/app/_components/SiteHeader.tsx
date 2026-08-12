import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="page-width header-inner">
        <Link className="brand" href="/" aria-label="Roadmap home">
          <span className="brand-mark" aria-hidden="true">R</span>
          <span>Roadmap</span>
        </Link>

        <nav className="primary-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#sample">Sample roadmap</a>
          <a href="#fit">Product fit</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>

        <div className="header-actions">
          <a className="sign-in-link" href="/auth/login?return_to=%2Fapp">Sign in</a>
          <a className="button button-header" href="/auth/login?return_to=%2Fapp">Open Roadmap</a>
        </div>
      </div>
    </header>
  );
}
