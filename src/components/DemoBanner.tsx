/**
 * Every figure in this app is invented, and the app says so on every screen.
 *
 * A stated client requirement rather than a disclaimer, and the reasoning is
 * worth keeping: an unlabelled demo figure gets read as a real one, and the
 * cost lands on whoever then goes looking for why it disagrees with the real
 * system. Labelling is cheaper than that search, every time.
 *
 * So it sits in the chrome, on every route, above the content — not in a
 * corner, and not only in the narration.
 */
export function DemoBanner() {
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '0 var(--rw-page-x)',
        height: 34,
        flex: 'none',
        background: 'var(--rw-warning-soft)',
        borderBottom: '1px solid color-mix(in srgb, var(--rw-warning) 22%, transparent)',
        color: 'color-mix(in srgb, var(--rw-warning) 82%, #000)',
        fontSize: 12.5,
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flex: 'none' }}>
        <path
          d="M12 9v4M12 17h.01M10.3 3.9 2.5 17.5A1.7 1.7 0 0 0 4 20h16a1.7 1.7 0 0 0 1.5-2.5L13.7 3.9a1.7 1.7 0 0 0-3 0Z"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      </svg>
      <strong style={{ fontWeight: 600 }}>Demo data.</strong>
      <span>Every figure here is illustrative and does not come from Realwired&rsquo;s systems.</span>
    </div>
  );
}
