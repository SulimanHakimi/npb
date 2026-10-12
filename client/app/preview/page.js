export default function LandingPage() {
  return (
    <main data-edit-id="page" style={{ fontFamily: "Inter, system-ui, sans-serif", background: "#f8fafc", color: "#0f172a", minHeight: "100vh" }}>
      <nav data-edit-id="nav" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 48px", background: "#ffffff", borderBottom: "1px solid #e2e8f0" }}>
        <div data-edit-id="nav-logo" style={{ fontSize: 22, fontWeight: 800, color: "#4f46e5" }}>Bitlinks</div>
        <div data-edit-id="nav-links" style={{ display: "flex", gap: 28, fontSize: 15, color: "#475569" }}>
          <a data-edit-id="nav-link-features" href="#features" style={{ color: "inherit", textDecoration: "none" }}>Features</a>
          <a data-edit-id="nav-link-pricing" href="#pricing" style={{ color: "inherit", textDecoration: "none" }}>Pricing</a>
          <a data-edit-id="nav-link-docs" href="#docs" style={{ color: "inherit", textDecoration: "none" }}>Docs</a>
        </div>
      </nav>

      <section data-edit-id="hero" style={{ display: "flex", alignItems: "center", gap: 48, padding: "72px 48px", maxWidth: 1200, margin: "0 auto" }}>
        <div data-edit-id="hero-content" style={{ flex: 1, position: "relative", left: 552, top: -10, color: "#004cff" }}>
          <span data-edit-id="hero-badge" style={{ display: "inline-block", padding: "6px 12px", borderRadius: 999, background: "#e0e7ff", color: "#4338ca", fontSize: 13, fontWeight: 600 }}>New: link analytics 2.0</span>
          <h1 data-edit-id="hero-title" style={{ fontSize: 52, lineHeight: 1.1, fontWeight: 800, margin: "20px 0 16px", position: "relative", left: 5, top: 0 }}>Short links that work as hard as you do</h1>
          <p data-edit-id="hero-subtitle" style={{ fontSize: 18, lineHeight: 1.6, color: "#475569", margin: "0 0 32px", maxWidth: 520 }}>Create branded short links, track every click, and share smarter with real-time analytics.</p>
          <div data-edit-id="hero-actions" style={{ display: "flex", gap: 12 }}>
            <button data-edit-id="hero-cta" style={{ padding: "14px 26px", borderRadius: 10, border: "none", background: "#4f46e5", color: "#ffffff", fontSize: 16, fontWeight: 600, cursor: "pointer" }}>Get started free</button>
            <button data-edit-id="hero-secondary" style={{ padding: "14px 26px", borderRadius: 10, border: "1px solid #cbd5e1", background: "#ffffff", color: "#0f172a", fontSize: 16, fontWeight: 600, cursor: "pointer" }}>Watch demo</button>
          </div>
        </div>
        <img data-edit-id="hero-image" src="/hero.svg" alt="Analytics dashboard illustration" style={{ width: 460, height: 340, borderRadius: 16, position: "relative", left: -641, top: -43 }} />
      </section>

      <section data-edit-id="features" id="features" style={{ display: "flex", gap: 24, padding: "24px 48px 80px", maxWidth: 1200, margin: "0 auto" }}>
        <div data-edit-id="feature-1" style={{ flex: 1, padding: 28, borderRadius: 14, background: "#ffffff", border: "1px solid #e2e8f0" }}>
          <h3 data-edit-id="feature-1-title" style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>Branded links</h3>
          <p data-edit-id="feature-1-text" style={{ fontSize: 15, lineHeight: 1.6, color: "#64748b", margin: 0 }}>Use your own domain so every link builds trust in your brand.</p>
        </div>
        <div data-edit-id="feature-2" style={{ flex: 1, padding: 28, borderRadius: 14, background: "#ffffff", border: "1px solid #e2e8f0" }}>
          <h3 data-edit-id="feature-2-title" style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>Live analytics</h3>
          <p data-edit-id="feature-2-text" style={{ fontSize: 15, lineHeight: 1.6, color: "#64748b", margin: 0 }}>See clicks, locations and devices the moment they happen.</p>
        </div>
        <div data-edit-id="feature-3" style={{ flex: 1, padding: 28, borderRadius: 14, background: "#ffffff", border: "1px solid #e2e8f0" }}>
          <h3 data-edit-id="feature-3-title" style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>QR codes</h3>
          <p data-edit-id="feature-3-text" style={{ fontSize: 15, lineHeight: 1.6, color: "#64748b", margin: 0 }}>Generate a QR code for every link and take it offline.</p>
        </div>
      </section>

      <footer data-edit-id="footer" style={{ padding: "28px 48px", borderTop: "1px solid #e2e8f0", color: "#94a3b8", fontSize: 14, textAlign: "center" }}>
        © 2026 Bitlinks. All rights reserved.
      </footer>
    </main>
  );
}
