import { RoadmapSample } from "./_components/RoadmapSample";
import { SiteFooter } from "./_components/SiteFooter";
import { SiteHeader } from "./_components/SiteHeader";

// Internal commercial reference only:
// [PRICING HYPOTHESIS — REQUIRES VALIDATION] CAD $75/month per individual instructor.
// Do not surface this amount or allow a charge until Aaron approves the live offer.

const steps = [
  {
    number: "01",
    title: "Add your coaching judgment",
    body: "Record the golfer’s goal, your starting assessment, the priority barriers, and only the evidence that explains the decision.",
  },
  {
    number: "02",
    title: "Shape the development roadmap",
    body: "Set three or four directional phases, choose what comes first, and connect it to a lesson package you already sell.",
  },
  {
    number: "03",
    title: "Preview and share",
    body: "Review the golfer’s exact view, then hand off to your existing booking, purchase, or contact process.",
  },
];

const included = [
  "One coach identity with clean, standard branding",
  "Roadmap templates, prompts, and plain-language guidance",
  "Golfer records and roadmaps for ordinary solo-instructor use",
  "Your current packages and external next-step links",
  "Private golfer preview and sharing",
  "A clear self-serve choice with no custom quote or sales call",
];

const faqs = [
  {
    question: "Do I have to change my coaching method?",
    answer:
      "No. You provide and approve the goal, assessment, barriers, phases, evidence, progress signals, and package fit. Roadmap organizes your judgment; it does not diagnose or coach the golfer.",
  },
  {
    question: "Do I need a launch monitor or swing video?",
    answer:
      "No. Use video, measurements, or launch data only when they help explain the decision. A concise coach-observation version can stand on its own.",
  },
  {
    question: "What does the golfer receive?",
    answer:
      "A private, coach-branded roadmap showing their goal, starting point, priority barriers, development phases, recommended first phase, connected package, and clear next choices.",
  },
  {
    question: "Does Roadmap handle booking or payment?",
    answer:
      "No. Add the booking, purchase, or contact link you already use. Roadmap explains the recommendation and then hands the golfer to that process.",
  },
  {
    question: "Is this for academies or multi-coach facilities?",
    answer:
      "The first release is for one independent instructor. Shared team administration and academy-wide reporting are outside this version.",
  },
  {
    question: "When will I see the price?",
    answer:
      "The exact price, recurrence, and complete terms will be shown in Canadian dollars before any paid choice. Nothing on this page creates a charge.",
  },
];

export default function Home() {
  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <SiteHeader />

      <main id="main-content">
        <section className="hero section-pad" aria-labelledby="hero-heading">
          <div className="ambient ambient-one" aria-hidden="true" />
          <div className="ambient ambient-two" aria-hidden="true" />
          <div className="page-width hero-grid">
            <div className="hero-copy">
              <p className="eyebrow">For independent golf instructors across Canada</p>
              <h1 id="hero-heading">Sell the plan, not another hour.</h1>
              <p className="hero-lede">
                Turn one assessment into a personalized, coach-branded roadmap
                that shows a golfer what comes first, why it matters, and which
                lesson package fits.
              </p>
              <div className="button-row">
                <a className="button button-primary" href="/auth/login?return_to=%2Fapp">
                  Start your first roadmap
                  <span aria-hidden="true">→</span>
                </a>
                <a className="button button-secondary" href="#sample">
                  See the fictional sample
                </a>
              </div>
              <p className="auth-entry-note">
                New here? The same secure identity entry handles sign-in and account
                creation when the selected provider enables signup.
              </p>
              <ul className="reassurance-list" aria-label="Key product assurances">
                <li>No sales call</li>
                <li>No custom proposal</li>
                <li>Your coaching method stays yours</li>
              </ul>
            </div>

            <div className="hero-preview" aria-label="Fictional roadmap preview">
              <div className="preview-window">
                <div className="preview-topline">
                  <div>
                    <p className="preview-kicker">Bennett Golf Coaching</p>
                    <p className="preview-for">Prepared for Mark Chen</p>
                  </div>
                  <span className="sample-pill">Synthetic sample</span>
                </div>

                <div className="preview-hero-copy">
                  <span className="mini-label">Your goal</span>
                  <h2>Break 90 more consistently.</h2>
                  <p>
                    Build a playable driver pattern so one or two holes no
                    longer decide the round.
                  </p>
                </div>

                <div className="preview-phase">
                  <div className="phase-index" aria-hidden="true">01</div>
                  <div>
                    <span className="mini-label">Recommended first</span>
                    <h3>Start-Line Control</h3>
                    <p>A more predictable initial direction at manageable speed.</p>
                  </div>
                </div>

                <div className="preview-footer">
                  <span>Connected to Maya’s existing 3-session package</span>
                  <span className="round-arrow" aria-hidden="true">↗</span>
                </div>
              </div>
              <p className="sample-disclaimer">
                Maya Bennett, Mark Chen, the coaching details, and outcomes are
                fictional. This is not a customer result.
              </p>
            </div>
          </div>
        </section>

        <section className="problem-band" aria-labelledby="problem-heading">
          <div className="page-width problem-grid">
            <p className="section-index" aria-hidden="true">01 / The gap</p>
            <div>
              <h2 id="problem-heading">
                A good assessment can still end with an unclear next step.
              </h2>
              <p className="section-lede">
                You may see the pattern clearly while the golfer leaves with
                separate notes, clips, numbers, and advice—but no coherent
                picture of why structured coaching should continue.
              </p>
            </div>
            <p className="outcome-note">
              Roadmap brings the goal, your evidence, the sequence, and the
              appropriate first package into one calm development story.
            </p>
          </div>
        </section>

        <section className="section-pad" id="how-it-works" aria-labelledby="how-heading">
          <div className="page-width">
            <div className="section-heading-row">
              <div>
                <p className="eyebrow">One assessment. One clear handoff.</p>
                <h2 id="how-heading">From coaching judgment to golfer clarity.</h2>
              </div>
              <p>
                Short, coach-owned inputs become a structured view the golfer
                can understand—without a custom report or mandatory onboarding.
              </p>
            </div>

            <ol className="steps-grid">
              {steps.map((step) => (
                <li key={step.number} className="step-card">
                  <span className="step-number" aria-hidden="true">{step.number}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="sample-section section-pad" id="sample" aria-labelledby="sample-heading">
          <div className="page-width">
            <div className="sample-heading">
              <div>
                <p className="eyebrow">Fictional sample · Mark Chen</p>
                <h2 id="sample-heading">
                  See what the coach enters—and what the golfer understands.
                </h2>
              </div>
              <p className="sample-notice">
                Synthetic coaching scenario. It demonstrates structure, not a
                validated result, timeline, or performance promise.
              </p>
            </div>
            <RoadmapSample />
            <div className="button-row" style={{ marginTop: "2rem" }}>
              <a className="button button-primary" href="/demo">
                Explore the resettable synthetic journey
              </a>
            </div>
          </div>
        </section>

        <section className="section-pad fit-section" id="fit" aria-labelledby="fit-heading">
          <div className="page-width">
            <div className="section-heading-row fit-heading-row">
              <div>
                <p className="eyebrow">Designed to sit above your workflow</p>
                <h2 id="fit-heading">Keep the tools and method that already work.</h2>
              </div>
              <p>
                Roadmap is a presentation and continuity layer. It is not a new
                coaching system or an all-in-one operations platform.
              </p>
            </div>

            <div className="fit-grid">
              <article className="fit-card fit-card-positive">
                <p className="fit-label">Works with</p>
                <h3>Your existing coaching stack</h3>
                <ul className="check-list">
                  <li>Assessment and lesson workflow</li>
                  <li>Swing video or analysis tools</li>
                  <li>Launch-monitor data when useful</li>
                  <li>Booking, payment, and contact links</li>
                  <li>Email, text, or normal client communication</li>
                </ul>
              </article>
              <article className="fit-card">
                <p className="fit-label">Does not replace</p>
                <h3>The work only you can do</h3>
                <ul className="boundary-list">
                  <li>Your judgment or coaching methodology</li>
                  <li>Booking or payment processing</li>
                  <li>Swing diagnosis or instruction</li>
                  <li>Client messaging</li>
                  <li>A full CRM or academy-management system</li>
                </ul>
              </article>
            </div>

            <div className="prep-card">
              <div>
                <p className="eyebrow">Before you begin</p>
                <h3>Three things make a first roadmap.</h3>
              </div>
              <ol className="prep-list">
                <li><span>1</span>A golfer’s desired outcome</li>
                <li><span>2</span>Your assessment and priority barriers</li>
                <li><span>3</span>One current package and its next-step link</li>
              </ol>
              <p className="optional-note">
                Logo, video, launch data, measurements, and a detailed biography
                are optional.
              </p>
            </div>
          </div>
        </section>

        <section className="pricing-section section-pad" id="pricing" aria-labelledby="pricing-heading">
          <div className="page-width pricing-grid">
            <div className="pricing-copy">
              <p className="eyebrow">Built for one independent instructor</p>
              <h2 id="pricing-heading">A focused solo plan, without a custom quote.</h2>
              <p>
                Start in the product, build around a real assessment, and review
                the exact golfer experience before you share it.
              </p>
              <p className="pricing-integrity">
                Roadmap does not promise a package sale. It helps you present
                your own recommendation clearly and gives the golfer room to
                decide.
              </p>
            </div>

            <article className="pricing-card" aria-label="Solo workspace">
              <div className="pricing-card-top">
                <div>
                  <p className="plan-name">Solo workspace</p>
                  <p className="price-status">Final price before charge</p>
                </div>
                <span className="canada-pill">CAD</span>
              </div>
              <p className="price-explainer">
                The complete Canadian-dollar price and terms will appear before
                you make any paid choice. Nothing on this page creates a charge.
              </p>
              <ul className="included-list">
                {included.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <a className="button button-primary button-full" href="/auth/login?return_to=%2Fapp">
                Open Roadmap
                <span aria-hidden="true">→</span>
              </a>
              <p className="pricing-fineprint">
                Exact recurrence, cancellation, pause, and refund details are
                shown before any paid confirmation.
              </p>
            </article>
          </div>
        </section>

        <section className="faq-section section-pad" id="faq" aria-labelledby="faq-heading">
          <div className="page-width faq-grid">
            <div className="faq-intro">
              <p className="eyebrow">Plain answers</p>
              <h2 id="faq-heading">Know what Roadmap is—and what it is not.</h2>
              <p>
                The first version stays deliberately narrow: a clearer path
                from assessment to an appropriate package recommendation.
              </p>
            </div>
            <div className="faq-list">
              {faqs.map((faq, index) => (
                <details key={faq.question} open={index === 0}>
                  <summary>{faq.question}</summary>
                  <p>{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="final-cta" aria-labelledby="final-heading">
          <div className="page-width final-cta-inner">
            <p className="eyebrow eyebrow-light">Your next assessment can become a clearer plan.</p>
            <h2 id="final-heading">Start with one golfer and one package.</h2>
            <p>
              Bring your coaching judgment. Roadmap helps you shape, preview,
              and share the story around it.
            </p>
            <a className="button button-light" href="/auth/login?return_to=%2Fapp">
              Start your first roadmap
              <span aria-hidden="true">→</span>
            </a>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
