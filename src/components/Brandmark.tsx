/**
 * The Realwired emblem, plus the product name.
 *
 * The emblem is the supplied asset, unmodified and served from /public — not a
 * traced copy. Its fill comes from the token rather than the file's own
 * #AB2225 so a theme flip cannot leave the mark behind, and the two agree in
 * light mode anyway.
 */
export function Brandmark({ collapsed }: { collapsed: boolean }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
      <img
        src="/brand/realwired-logo-emblem-main.svg"
        alt=""
        width={23}
        height={22}
        style={{ flex: 'none' }}
      />
      {!collapsed && (
        <span
          style={{
            fontFamily: 'var(--rw-font-display)',
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'var(--rw-ink)',
            whiteSpace: 'nowrap',
          }}
        >
          Reporter
        </span>
      )}
    </span>
  );
}
