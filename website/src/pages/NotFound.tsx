import { Link, NAV_ROUTES, ROUTES } from '../router';
import { Section } from '../components/Layout';

/**
 * A real 404.
 *
 * `vercel.json` serves `dist/404.html` for any path with no prerendered file
 * (with a genuine 404 status), so this is what a mistyped URL actually shows —
 * not the host's bare "Not Found". Unlike the rest of the site it is rendered
 * at that moment rather than prerendered per route, because there is no route.
 */
export default function NotFound() {
  const extra = ROUTES.filter((r) => !r.nav && r.footer);
  return (
    <Section className="page-head notfound">
      <span className="caps eyebrow-text">404</span>
      <h1 className="hero-title-sm">That page does not exist</h1>
      <p className="muted lede-sm">
        The link may be old, or the address may have a typo. Here is everything the site has:
      </p>
      <ul className="notfound-links">
        {NAV_ROUTES.filter((r) => r.path !== '/').map((r) => (
          <li key={r.path}>
            <Link to={r.path}>{r.nav}</Link>
          </li>
        ))}
        {extra.map((r) => (
          <li key={r.path}>
            <Link to={r.path}>{r.title.split(' — ')[0].split(' | ')[0]}</Link>
          </li>
        ))}
      </ul>
      <Link to="/" className="btn btn-ghost">
        Back to the home page
      </Link>
    </Section>
  );
}
