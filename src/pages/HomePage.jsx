import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, CheckCircle2, BarChart3, Users, ShieldCheck,
  MessageSquareText, TrendingUp, Building2, ChevronRight,
  Sparkles, Lock, Globe, ArrowUp
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './HomePage.css';

/* ── Static data ── */
const FEATURES = [
  {
    icon: <MessageSquareText size={22} />,
    title: 'Structured Feedback Collection',
    desc: 'Create focused consultation campaigns and invite specific stakeholders to submit open-text comments on proposed policies.',
  },
  {
    icon: <Sparkles size={22} />,
    title: 'Automated Sentiment Analysis',
    desc: 'Every comment is automatically classified as Positive, Neutral, or Negative by our NLP microservice — no manual tagging needed.',
  },
  {
    icon: <BarChart3 size={22} />,
    title: 'Insight Dashboard',
    desc: 'Campaign managers get a clear, real-time view of sentiment distribution, participation rates, and comments requiring attention.',
  },
  {
    icon: <Users size={22} />,
    title: 'Role-Based Access Control',
    desc: 'Three distinct roles — Administrator, Campaign Manager, and Stakeholder — with precise permissions at every level.',
  },
  {
    icon: <Building2 size={22} />,
    title: 'Multi-Tenant Architecture',
    desc: 'Each organisation is fully isolated. Your data is yours — no cross-organisation data leakage, ever.',
  },
  {
    icon: <Lock size={22} />,
    title: 'Audit-Ready & Transparent',
    desc: 'Every sentiment inference is deterministic and logged, giving you a clear audit trail for governance and compliance.',
  },
];

const STEPS = [
  {
    num: '01',
    title: 'Admin Onboards Organisation',
    desc: 'The organisation administrator registers the institutional tenant, completes the profile, receives the secret organisation code, and enrolls members.',
  },
  {
    num: '02',
    title: 'Managers Craft Consultations',
    desc: 'Invited campaign managers draft policy consultation campaigns with 1 to 10 structured questions, select active stakeholders, and open the campaign.',
  },
  {
    num: '03',
    title: 'Stakeholders Deliberate',
    desc: 'Stakeholders receive direct invitations and participate using campaign code + email — no passwords or account registration required.',
  },
  {
    num: '04',
    title: 'Track Responses & Deliberation',
    desc: 'Campaign managers and administrators review anonymised stakeholder submissions and deliberation response streams.',
  },
];

const ROLES = [
  {
    role: 'Administrator',
    color: 'role-admin',
    icon: <ShieldCheck size={20} />,
    perks: [
      'Registers organisation and generates secret org code',
      'Adds and removes campaign managers & stakeholders',
      'Views all campaigns and submissions read-only',
      'Holds direct deletion authority for all campaigns',
    ],
  },
  {
    role: 'Campaign Manager',
    color: 'role-manager',
    icon: <TrendingUp size={20} />,
    perks: [
      'Registers via admin invitation with organisation code',
      'Creates, edits, and deletes own consultation campaigns',
      'Selects stakeholder participants and dispatches invites',
      'Monitors submissions and views responses to own campaigns',
    ],
  },
  {
    role: 'Stakeholder',
    color: 'role-stakeholder',
    icon: <Globe size={20} />,
    perks: [
      'Never registers — zero password friction',
      'Enrolled directly by organisation administrator',
      'Participates securely with campaign code + email',
      'Submits candid, open-text answers to questions',
    ],
  },
];

const STATS = [
  { value: '3', label: 'Governed Roles' },
  { value: '100%', label: 'Tenant Isolation' },
  { value: 'Zero-Pass', label: 'Stakeholder Friction' },
  { value: 'Real-time', label: 'Response Tracking' },
];

/* ── Component ── */
export default function HomePage() {
  const { user } = useAuth();
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="home">

      {/* ── HERO ── */}
      <section className="hero">
        <div className="hero__glow" />
        <div className="container hero__inner">
          <div className="hero__content animate-fade-in">
            <div className="hero__eyebrow">
              <span className="badge badge-decision">Interim Demo Build · Stage 1</span>
            </div>
            <h1 className="hero__title">
              Turn Sentiment into{' '}
              <span className="hero__title-accent">Smarter Policies.</span>
            </h1>
            <p className="hero__subtitle">
              PotentPolicy is a structured e-consultation platform that helps private institutions collect
              stakeholder feedback on proposed policies, maintain strict tenant governance, and make
              transparent, data-informed decisions.
            </p>
            <div className="hero__actions">
              {user ? (
                <Link to="/dashboard" className="btn btn-accent btn-lg">
                  Proceed to Dashboard
                  <ArrowRight size={18} />
                </Link>
              ) : (
                <>
                  <Link to="/register" className="btn btn-accent btn-lg">
                    Register Organisation
                    <ArrowRight size={18} />
                  </Link>
                  <Link to="/login" className="btn btn-secondary btn-lg">
                    Sign In
                  </Link>
                </>
              )}
            </div>
            <div className="hero__trust">
              <CheckCircle2 size={14} />
              <span>No credit card required</span>
              <span className="hero__trust-dot">·</span>
              <CheckCircle2 size={14} />
              <span>Multi-tenant & secure</span>
              <span className="hero__trust-dot">·</span>
              <CheckCircle2 size={14} />
              <span>AI-powered sentiment</span>
            </div>
          </div>

          {/* Hero Visual */}
          <div className="hero__visual animate-fade-in-right">
            <div className="hero__card">
              <div className="hero__card-header">
                <div className="hero__card-dot hero__card-dot--green" />
                <span className="hero__card-title">Work-from-Home Policy — Feedback</span>
                <span className="badge badge-positive">Active</span>
              </div>
              <div className="hero__card-stats">
                <div className="hero__stat">
                  <span className="hero__stat-value">78</span>
                  <span className="hero__stat-label">Responses</span>
                </div>
                <div className="hero__stat">
                  <span className="hero__stat-value" style={{ color: 'var(--sentiment-positive)' }}>42%</span>
                  <span className="hero__stat-label">Positive</span>
                </div>
                <div className="hero__stat">
                  <span className="hero__stat-value" style={{ color: 'var(--sentiment-negative)' }}>35%</span>
                  <span className="hero__stat-label">Negative</span>
                </div>
                <div className="hero__stat">
                  <span className="hero__stat-value" style={{ color: 'var(--sentiment-neutral)' }}>23%</span>
                  <span className="hero__stat-label">Neutral</span>
                </div>
              </div>
              <div className="hero__bar-row">
                <div className="hero__bar-label">Sentiment Distribution</div>
                <div className="hero__bar-track">
                  <div className="hero__bar-fill hero__bar-fill--positive" style={{ width: '42%' }} />
                  <div className="hero__bar-fill hero__bar-fill--negative" style={{ width: '35%' }} />
                  <div className="hero__bar-fill hero__bar-fill--neutral"  style={{ width: '23%' }} />
                </div>
              </div>
              <div className="hero__comments">
                {[
                  { text: '"The policy may improve work-life balance greatly."', sent: 'Positive' },
                  { text: '"Approval process should be explained more clearly."', sent: 'Neutral' },
                  { text: '"Some departments may not function effectively remote."', sent: 'Negative' },
                ].map((c, i) => (
                  <div key={i} className="hero__comment">
                    <p className="hero__comment-text">{c.text}</p>
                    <span className={`badge badge-${c.sent.toLowerCase()}`}>{c.sent}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS STRIP ── */}
      <section className="stats-strip">
        <div className="container">
          <div className="stats-strip__grid">
            {STATS.map((s, i) => (
              <div key={i} className="stats-strip__item">
                <span className="stats-strip__value">{s.value}</span>
                <span className="stats-strip__label">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="section" id="features">
        <div className="container">
          <div className="section-header">
            <p className="section-eyebrow">What We Offer</p>
            <h2>Everything you need for policy consultation</h2>
            <p className="section-subtitle">
              A focused, purpose-built toolkit that makes stakeholder engagement structured, transparent, and actionable.
            </p>
          </div>
          <div className="features-grid">
            {FEATURES.map((f, i) => (
              <div key={i} className="feature-card card">
                <div className="feature-card__icon">{f.icon}</div>
                <h4 className="feature-card__title">{f.title}</h4>
                <p className="feature-card__desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="section how-it-works" id="how-it-works">
        <div className="container">
          <div className="section-header">
            <p className="section-eyebrow">The Process</p>
            <h2>From proposal to decision in 4 steps</h2>
            <p className="section-subtitle">
              A simple, repeatable workflow that keeps every stakeholder consultation structured and traceable.
            </p>
          </div>
          <div className="steps-grid">
            {STEPS.map((s, i) => (
              <div key={i} className="step-card">
                <div className="step-card__num">{s.num}</div>
                <h4 className="step-card__title">{s.title}</h4>
                <p className="step-card__desc">{s.desc}</p>
                {i < STEPS.length - 1 && (
                  <div className="step-card__arrow">
                    <ChevronRight size={16} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ROLES ── */}
      <section className="section" id="roles">
        <div className="container">
          <div className="section-header">
            <p className="section-eyebrow">For Every Team</p>
            <h2>Built for every role in your organisation</h2>
            <p className="section-subtitle">
              Three distinct roles, each with the right level of access and capabilities to do their job effectively.
            </p>
          </div>
          <div className="roles-grid">
            {ROLES.map((r, i) => (
              <div key={i} className={`role-card card ${r.color}`}>
                <div className="role-card__header">
                  <div className="role-card__icon">{r.icon}</div>
                  <h4 className="role-card__title">{r.role}</h4>
                </div>
                <ul className="role-card__perks">
                  {r.perks.map((p, j) => (
                    <li key={j}>
                      <CheckCircle2 size={14} />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section className="cta-section">
        <div className="container">
          <div className="cta-inner">
            <div>
              <h2 className="cta-title">Ready to modernise your policy consultations?</h2>
              <p className="cta-subtitle">
                Register your organisation today and run your first campaign in minutes.
              </p>
            </div>
            <div className="cta-actions">
              {user ? (
                <Link to="/dashboard" className="btn btn-accent btn-lg">
                  Proceed to Dashboard
                  <ArrowRight size={18} />
                </Link>
              ) : (
                <>
                  <Link to="/register" className="btn btn-accent btn-lg">
                    Register Organisation
                    <ArrowRight size={18} />
                  </Link>
                  <Link to="/login" className="btn btn-secondary btn-lg">
                    Already have an account? Sign In
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Floating Scroll-to-Top Button */}
      {showScrollTop && (
        <button
          type="button"
          className="home-scroll-top-btn animate-fade-in"
          onClick={scrollToTop}
          aria-label="Scroll to top of home page"
          title="Back to top"
        >
          <ArrowUp size={20} />
        </button>
      )}

    </div>
  );
}
