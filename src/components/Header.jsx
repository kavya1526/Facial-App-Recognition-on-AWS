import { NavLink } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectStats } from '../store/checkInsSlice';

const linkClass = ({ isActive }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium ${
    isActive ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-100'
  }`;

/**
 * Reads the store directly rather than taking props. It is a sibling of the
 * check-in form, not its parent, so there is no prop path between them.
 */
export default function Header() {
  const { total, granted, denied } = useSelector(selectStats);

  return (
    <header className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4">
      <nav className="flex gap-2">
        <NavLink to="/" end className={linkClass}>
          Check in
        </NavLink>
        <NavLink to="/history" className={linkClass}>
          History
          {total > 0 && (
            <span className="ml-1.5 rounded-full bg-gray-200 px-1.5 py-0.5 text-xs text-gray-700">
              {total}
            </span>
          )}
        </NavLink>
      </nav>

      {total > 0 && (
        <p className="text-sm text-gray-500">
          <span className="text-success">{granted} granted</span>
          {' · '}
          <span className="text-danger">{denied} denied</span>
        </p>
      )}
    </header>
  );
}
