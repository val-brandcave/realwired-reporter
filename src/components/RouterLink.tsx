import { Link } from 'react-router-dom';
import type { LinkProps as UiLinkProps } from '@realwired/ui';

/**
 * The shell's link seam is `href`-based, which is right — it has to serve
 * plain anchors, next/link and Inertia, all of which take `href`. React Router
 * is the odd one out: its Link takes `to`. So the host adapts, in one line,
 * which is where the adapting belongs.
 *
 * (@realwired/ui's own comment says `linkComponent={Link}` works for React
 * Router. It does not typecheck — corrected upstream on 9 Sept.)
 */
export function RouterLink({ href, children, ...rest }: UiLinkProps) {
  return (
    <Link to={href} {...rest}>
      {children}
    </Link>
  );
}
