import { Link } from 'react-router-dom'
import { MapPin, Phone, Mail, ArrowUpRight, ChevronRight } from 'lucide-react'
import hairgoLogo from '../../assets/hairgo.png'
import { HOURS_LABELS } from '../../lib/hours'

const NAV_LINKS = [
  { to: '/',             label: 'Home' },
  { to: '/gallery',      label: 'Gallery' },
  { to: '/appointments', label: 'Book Appointment' },
  { to: '/store',        label: 'Shop Products' },
  { to: '/stylists',     label: 'Our Team' },
]

const CONTACT = [
  { icon: MapPin, text: <>Shop 3.26A, Coast Plaza<br />719 Whangaparāoa Rd, Auckland 0932</> },
  { icon: Phone,  text: '021 155 5429' },
  { icon: Mail,   text: 'hello@hairgo.co.nz' },
]

const HOURS = HOURS_LABELS.map(h => ({ ...h, open: true }))

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer style={{ position: 'relative', background: '#0d1e2f', overflow: 'hidden' }}>

      {/* ── Ambient glow ──────────────────────────────── */}
      <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 900, height: 400, background: 'radial-gradient(ellipse at top, rgba(184,212,232,0.07) 0%, transparent 65%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: 0, left: '10%', width: 500, height: 300, background: 'radial-gradient(ellipse, rgba(122,175,201,0.04) 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* ── Top accent line ───────────────────────────── */}
      <div style={{ height: 1, background: 'linear-gradient(90deg, transparent 0%, rgba(184,212,232,0.22) 25%, rgba(122,175,201,0.28) 50%, rgba(184,212,232,0.22) 75%, transparent 100%)' }} />

      {/* ── Main content ──────────────────────────────── */}
      <div className="footer-main" style={{ maxWidth: 1200, margin: '0 auto', padding: '44px 32px 0', position: 'relative' }}>
        <div className="footer-grid" style={{ display: 'grid', gap: 40 }}>

          {/* ── Brand ─────────────────────────────────── */}
          <div className="footer-brand">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
                <img src={hairgoLogo} alt="HairGo" style={{ width: 28, height: 28, borderRadius: '50%', border: '1.5px solid rgba(184,212,232,0.4)', boxShadow: '0 4px 16px rgba(184,212,232,0.25)', flexShrink: 0, objectFit: 'cover' }} />
                <span className="font-display" style={{ fontSize: '1.25rem', color: '#fff', lineHeight: 1, letterSpacing: '0.01em' }}>
                  Hair<span style={{ color: '#B8D4E8' }}>Go</span>
                </span>
              </Link>
              <a href="#" aria-label="Instagram" className="footer-social"
                style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.75)', transition: 'all 0.3s ease', textDecoration: 'none', flexShrink: 0 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                </svg>
              </a>
            </div>

            <p style={{ fontSize: 12, lineHeight: 1.8, color: 'rgba(255,255,255,0.75)', maxWidth: 240, marginBottom: 10, fontFamily: 'DM Sans, sans-serif', fontWeight: 300 }}>
              Where elegance meets artistry. Premium hair care crafted for those who dare to stand out.
            </p>

            <div style={{ width: 28, height: 1, background: 'linear-gradient(90deg,#B8D4E8,transparent)' }} />
          </div>

          {/* ── Navigate ──────────────────────────────── */}
          <div className="footer-navigate">
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ fontSize: 9, letterSpacing: '0.28em', textTransform: 'uppercase', color: '#B8D4E8', marginBottom: 8, fontFamily: 'DM Sans, sans-serif', fontWeight: 600 }}>Navigate</h4>
              <div style={{ width: 20, height: 1, background: 'linear-gradient(90deg,rgba(184,212,232,0.5),transparent)' }} />
            </div>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 9 }}>
              {NAV_LINKS.map(({ to, label }) => (
                <li key={to}>
                  <Link to={to} className="footer-link"
                    style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', textDecoration: 'none', fontFamily: 'DM Sans, sans-serif', fontWeight: 300, display: 'inline-flex', alignItems: 'center', gap: 0, transition: 'all 0.25s ease' }}>
                    <ChevronRight size={10} className="footer-link-arrow" style={{ opacity: 0, marginRight: -4, transition: 'all 0.25s ease', color: '#B8D4E8', flexShrink: 0 }} />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Contact ───────────────────────────────── */}
          <div className="footer-contact">
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ fontSize: 9, letterSpacing: '0.28em', textTransform: 'uppercase', color: '#B8D4E8', marginBottom: 8, fontFamily: 'DM Sans, sans-serif', fontWeight: 600 }}>Contact</h4>
              <div style={{ width: 20, height: 1, background: 'linear-gradient(90deg,rgba(184,212,232,0.5),transparent)' }} />
            </div>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {CONTACT.map(({ icon: Icon, text }, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(184,212,232,0.05)', border: '1px solid rgba(184,212,232,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                    <Icon size={11} color="rgba(184,212,232,0.7)" strokeWidth={1.5} />
                  </div>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.65, fontFamily: 'DM Sans, sans-serif', fontWeight: 300 }}>{text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Hours ─────────────────────────────────── */}
          <div className="footer-hours">
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ fontSize: 9, letterSpacing: '0.28em', textTransform: 'uppercase', color: '#B8D4E8', marginBottom: 8, fontFamily: 'DM Sans, sans-serif', fontWeight: 600 }}>Hours</h4>
              <div style={{ width: 20, height: 1, background: 'linear-gradient(90deg,rgba(184,212,232,0.5),transparent)' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)', marginBottom: 14, maxWidth: 200, width: '100%' }}>
              {HOURS.map(({ day, time, open }, i) => (
                <div key={day} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: i < HOURS.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: open ? 'rgba(52,211,153,0.6)' : 'rgba(239,68,68,0.4)', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)', fontFamily: 'DM Sans, sans-serif', fontWeight: 300 }}>{day}</span>
                  </div>
                  <span style={{ fontSize: 11, color: open ? 'rgba(255,255,255,0.85)' : 'rgba(239,68,68,0.45)', fontFamily: 'DM Sans, sans-serif', fontWeight: open ? 300 : 500, letterSpacing: open ? '0.02em' : '0.12em', textTransform: open ? 'none' : 'uppercase' }}>{time}</span>
                </div>
              ))}
            </div>

            <Link to="/appointments" className="footer-cta"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9999, background: 'linear-gradient(135deg,rgba(184,212,232,0.1),rgba(122,175,201,0.06))', border: '1px solid rgba(184,212,232,0.18)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#B8D4E8', textDecoration: 'none', fontFamily: 'DM Sans, sans-serif', fontWeight: 500, transition: 'all 0.3s ease' }}>
              Book Now <ArrowUpRight size={10} />
            </Link>
          </div>

        </div>

        {/* ── Bottom bar ──────────────────────────────── */}
        <div className="footer-bottom" style={{ marginTop: 36, paddingTop: 16, paddingBottom: 20, borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.42)', letterSpacing: '0.06em', fontFamily: 'DM Sans, sans-serif', fontWeight: 300 }}>
            © {year} HairGo. All rights reserved.
          </p>
          <div className="footer-bottom-links" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {['Privacy', 'Terms', 'Cookies'].map((item, i) => (
              <>
                {i > 0 && <span key={`sep-${item}`} style={{ width: 1, height: 10, background: 'rgba(255,255,255,0.08)', display: 'inline-block' }} />}
                <a key={item} href="#" className="footer-legal"
                  style={{ fontSize: 11, color: 'rgba(255,255,255,0.42)', textDecoration: 'none', letterSpacing: '0.06em', fontFamily: 'DM Sans, sans-serif', fontWeight: 300, transition: 'color 0.3s ease', padding: '0 10px' }}>
                  {item}
                </a>
              </>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        .footer-grid { grid-template-columns: 1.4fr 0.7fr 1.1fr 1fr; align-items: start; }
        .footer-contact { padding-left: 0; display: flex; flex-direction: column; align-items: center; }
        .footer-navigate { display: flex; flex-direction: column; align-items: center; }
        .footer-hours { display: flex; flex-direction: column; align-items: center; }

        @media (max-width: 1023px) {
          .footer-grid { grid-template-columns: 1fr 1fr; gap: 32px !important; align-items: start; }
        }

        @media (max-width: 639px) {
          .footer-main { padding: 32px 24px 0 !important; }

          /* centered column */
          .footer-grid {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            gap: 0 !important;
          }
          .footer-navigate { display: none !important; }

          /* every section: centered, column */
          .footer-brand, .footer-contact, .footer-hours {
            width: 100% !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
          }

          /* ── brand ── */
          .footer-brand > div:first-child {
            width: 100% !important;
            margin-bottom: 8px !important;
          }
          .footer-brand p {
            display: block !important;
            text-align: center !important;
            font-size: 11px !important;
            line-height: 1.75 !important;
            max-width: 230px !important;
            margin: 0 auto 12px !important;
          }
          .footer-brand > div:last-child {
            width: 44px !important;
            background: linear-gradient(90deg, transparent, rgba(184,212,232,0.7), transparent) !important;
            margin-bottom: 0 !important;
          }
          .footer-brand {
            padding-bottom: 22px !important;
            border-bottom: 1px solid rgba(255,255,255,0.07) !important;
            margin-bottom: 22px !important;
          }

          /* ── contact ── */
          .footer-contact > div:first-child {
            align-items: center !important;
            margin-bottom: 14px !important;
          }
          .footer-contact > div:first-child h4 { text-align: center !important; }
          .footer-contact > div:first-child > div { margin: 5px auto 0 !important; }

          /* ul shrinks to content width → gets centered by parent */
          .footer-contact ul {
            gap: 9px !important;
            width: fit-content !important;
            align-items: flex-start !important;
          }
          .footer-contact li { gap: 8px !important; align-items: flex-start !important; }
          .footer-contact li > div {
            width: 22px !important; height: 22px !important;
            border-radius: 6px !important; flex-shrink: 0 !important;
            margin-top: 2px !important;
          }
          .footer-contact li span {
            font-size: 12px !important;
            line-height: 1.65 !important;
            text-align: left !important;
          }
          .footer-contact {
            padding-bottom: 22px !important;
            border-bottom: 1px solid rgba(255,255,255,0.07) !important;
            margin-bottom: 22px !important;
          }

          /* ── hours ── */
          .footer-hours > div:first-child {
            align-items: center !important;
            margin-bottom: 14px !important;
          }
          .footer-hours > div:first-child h4 { text-align: center !important; }
          .footer-hours > div:first-child > div { margin: 5px auto 0 !important; }
          .footer-hours > div:first-child + div {
            width: 100% !important;
            max-width: 220px !important;
            margin-bottom: 14px !important;
          }
          .footer-cta { display: inline-flex !important; }

          /* ── bottom bar ── */
          .footer-bottom {
            margin-top: 22px !important;
            padding-top: 14px !important;
            padding-bottom: 22px !important;
            flex-direction: column !important;
            align-items: center !important;
            text-align: center !important;
            gap: 6px !important;
          }
          .footer-bottom-links { justify-content: center !important; }
          .footer-bottom p, .footer-legal { font-size: 10px !important; }
        }

        .footer-social:hover {
          background: rgba(184,212,232,0.1) !important;
          border-color: rgba(184,212,232,0.28) !important;
          color: #B8D4E8 !important;
          transform: translateY(-2px);
          box-shadow: 0 4px 16px rgba(184,212,232,0.12);
        }
        .footer-link:hover {
          color: rgba(255,255,255,0.75) !important;
          padding-left: 4px;
        }
        .footer-link:hover .footer-link-arrow {
          opacity: 1 !important;
          margin-right: 4px !important;
        }
        .footer-cta:hover {
          background: linear-gradient(135deg,rgba(184,212,232,0.18),rgba(122,175,201,0.12)) !important;
          border-color: rgba(184,212,232,0.35) !important;
          box-shadow: 0 6px 24px rgba(184,212,232,0.15);
          transform: translateY(-1px);
        }
        .footer-legal:hover { color: rgba(255,255,255,0.42) !important; }
      `}</style>
    </footer>
  )
}
