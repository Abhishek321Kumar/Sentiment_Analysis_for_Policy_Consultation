import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Sun, Moon, Menu, X, ArrowRight } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import './Navbar.css';

export default function Navbar() {
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const location = useLocation();

  const isHome = location.pathname === '/';

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setDropdownOpen(false);
  }, [location]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <nav className={`navbar ${scrolled ? 'navbar--scrolled' : ''} ${menuOpen ? 'navbar--open' : ''}`}>
      <div className="navbar__container">
        {/* Logo */}
        <Link to="/" className="navbar__brand">
          <div className="navbar__logo">
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="7" fill="var(--brand-accent)"/>
              <path d="M8 10h10a6 6 0 0 1 0 12H8V10z" fill="white" opacity="0.9"/>
              <rect x="8" y="14" width="7" height="4" rx="1" fill="var(--brand-accent)"/>
            </svg>
          </div>
          <span className="navbar__brand-name">PotentPolicy</span>
        </Link>

        {/* Desktop Nav Links */}
        <ul className="navbar__links">
          {isHome && (
            <>
              <li><a href="#features" className="navbar__link">Features</a></li>
              <li><a href="#how-it-works" className="navbar__link">How It Works</a></li>
              <li><a href="#roles" className="navbar__link">For Teams</a></li>
            </>
          )}
        </ul>

        {/* Right Actions */}
        <div className="navbar__actions">
          <button
            className="navbar__theme-btn"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
          >
            {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
          </button>

          {user ? (
            <Link
              to="/dashboard"
              className="btn btn-primary btn-sm navbar__btn-register"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
            >
              Dashboard <ArrowRight size={14} />
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn btn-secondary btn-sm navbar__btn-login">
                Sign In
              </Link>
              <Link to="/register" className="btn btn-primary btn-sm navbar__btn-register">
                Register Admin
              </Link>
            </>
          )}

          {/* Mobile hamburger */}
          <button
            className="navbar__hamburger"
            onClick={() => setMenuOpen(p => !p)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="navbar__mobile">
          {isHome && (
            <>
              <a href="#features" className="navbar__mobile-link">Features</a>
              <a href="#how-it-works" className="navbar__mobile-link">How It Works</a>
              <a href="#roles" className="navbar__mobile-link">For Teams</a>
              <div className="divider" style={{ margin: '0.5rem 0' }} />
            </>
          )}
          {user ? (
            <Link
              to="/dashboard"
              className="navbar__mobile-link navbar__mobile-cta"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem' }}
            >
              Dashboard <ArrowRight size={14} />
            </Link>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
              <Link to="/login" className="btn btn-secondary btn-block">Sign In</Link>
              <Link to="/register" className="btn btn-primary btn-block">Register Admin →</Link>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
