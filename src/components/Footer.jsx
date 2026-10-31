import { Link } from 'react-router-dom';
import { Shield } from 'lucide-react';
import './Footer.css';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__grid">
          {/* Brand Column */}
          <div className="footer__brand-col">
            <Link to="/" className="footer__brand">
              <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
                <rect width="32" height="32" rx="7" fill="var(--brand-accent)"/>
                <path d="M8 10h10a6 6 0 0 1 0 12H8V10z" fill="white" opacity="0.9"/>
                <rect x="8" y="14" width="7" height="4" rx="1" fill="var(--brand-accent)"/>
              </svg>
              <span>PotentPolicy</span>
            </Link>
            <p className="footer__tagline">
              Smarter stakeholder consultations. Structured feedback. Transparent decisions.
            </p>
            <div className="footer__compliance">
              <Shield size={12} />
              <span>Phase 1 · Deliberation Compliance</span>
            </div>
          </div>

          {/* Links Columns */}
          <div className="footer__col">
            <h5 className="footer__col-title">Platform</h5>
            <ul className="footer__col-links">
              <li><a href="#features">Features</a></li>
              <li><a href="#how-it-works">How It Works</a></li>
              <li><a href="#roles">For Teams</a></li>
            </ul>
          </div>

          <div className="footer__col">
            <h5 className="footer__col-title">Account</h5>
            <ul className="footer__col-links">
              <li><Link to="/login">Sign In</Link></li>
              <li><Link to="/register">Register Organisation</Link></li>
            </ul>
          </div>

          <div className="footer__col">
            <h5 className="footer__col-title">Legal</h5>
            <ul className="footer__col-links">
              <li><a href="#">Privacy Policy</a></li>
              <li><a href="#">Terms of Service</a></li>
            </ul>
          </div>
        </div>

        <div className="footer__bottom">
          <p>© {year} PotentPolicy. All rights reserved.</p>
          <p className="footer__bottom-note">
            All sentiment inferences are deterministic and logged.
          </p>
        </div>
      </div>
    </footer>
  );
}
