import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="page-width footer-grid">
        <div>
          <Link className="brand brand-footer" href="/" aria-label="Roadmap home">
            <span className="brand-mark" aria-hidden="true">R</span>
            <span>Roadmap</span>
          </Link>
          <p>Coach-branded golf development roadmaps.</p>
        </div>
        <div className="footer-note">
          <p>For independent golf instructors across Canada.</p>
          <p>Roadmap is a working product name.</p>
        </div>
        <nav className="footer-nav" aria-label="Footer navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#sample">Fictional sample</a>
          <a href="#pricing">Solo workspace</a>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/support">Support</Link>
          <a href="/auth/login?return_to=%2Fapp">Open the app</a>
        </nav>
      </div>
    </footer>
  );
}
