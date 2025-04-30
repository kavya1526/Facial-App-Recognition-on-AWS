import { NavLink } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectStats } from '../store/checkInsSlice';

const linkClass = ({ isActive }) =>
  `relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive ? 'bg-accent text-on-accent' : 'text-muted hover:text-ink'
  }`;

/**
 * Reads the store directly rather than taking props. It is a sibling of the
 * check-in form, not its parent, so there is no prop path between them.
 */
export default function Header() {
  const { total, granted, denied } = useSelector(selectStats);

  return (
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <nav className="flex gap-1">
        <NavLink to="/" end className={linkClass}>
          Check in
        </NavLink>
        <NavLink to="/history" className={linkClass}>
          History
          {total > 0 && (
            <span className="ml-1.5 rounded-full bg-sunken px-1.5 py-0.5 text-xs tabular-nums text-muted">
              {total}
            </span>
          )}
        </NavLink>
      </nav>

      {total > 0 && (
        // Dots rather than the words "granted"/"denied": the counts sit beside
        // a nav, and two colour-coded numbers read faster than a sentence at
        // that size. The words stay in the accessible label.
        <p className="flex items-center gap-3 text-sm tabular-nums">
          <span className="flex items-center gap-1.5 text-muted">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
            {granted}
            <span className="sr-only">granted</span>
          </span>
          <span className="flex items-center gap-1.5 text-muted">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-danger" />
            {denied}
            <span className="sr-only">denied</span>
          </span>
        </p>
      )}
    </header>
  );
}
