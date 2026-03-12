import { NavLink } from 'react-router-dom'

export function Header() {
  return (
    <header className="bg-gray-900 text-white px-6 py-3 flex items-center justify-between shrink-0">
      <h1 className="text-base font-semibold tracking-tight">Roc Job Radar</h1>
      <nav className="flex items-center gap-1">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              isActive ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'
            }`
          }
        >
          Jobs
        </NavLink>
        <NavLink
          to="/admin"
          className={({ isActive }) =>
            `px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              isActive ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'
            }`
          }
        >
          Admin
        </NavLink>
        <NavLink
          to="/analytics"
          className={({ isActive }) =>
            `px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              isActive ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'
            }`
          }
        >
          Analytics
        </NavLink>
      </nav>
    </header>
  )
}
