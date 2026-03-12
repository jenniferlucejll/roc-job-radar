import type { Employer, JobFilters } from '../types/index.js'

interface Props {
  employers: Employer[]
  filters: JobFilters
  onChange: (f: JobFilters) => void
  jobCount: number
}

export function FilterBar({ employers, filters, onChange, jobCount }: Props) {
  function set<K extends keyof JobFilters>(key: K, value: JobFilters[K]) {
    onChange({ ...filters, [key]: value })
  }

  return (
    <div className="border-b border-gray-200 p-3 space-y-2 shrink-0">
      {/* Search */}
      <input
        type="text"
        placeholder="Search titles…"
        value={filters.q}
        onChange={(e) => set('q', e.target.value)}
        className="w-full text-sm border border-gray-300 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />

      <div className="flex gap-2">
        {/* Employer */}
        <select
          value={filters.employerId}
          onChange={(e) => set('employerId', e.target.value)}
          className="flex-1 text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
        >
          <option value="">All employers</option>
          {employers.map((e) => (
            <option key={e.id} value={String(e.id)}>
              {e.name}
            </option>
          ))}
        </select>

        {/* Status */}
        <select
          value={filters.status}
          onChange={(e) => set('status', e.target.value as JobFilters['status'])}
          className="text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
        >
          <option value="active">Active</option>
          <option value="removed">Removed</option>
          <option value="all">All</option>
        </select>
      </div>

      {/* New only */}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filters.newOnly}
            onChange={(e) => set('newOnly', e.target.checked)}
            className="rounded"
          />
          New only
        </label>
        {filters.newOnly && (
          <div className="flex items-center gap-1 text-sm text-gray-600">
            <span>within</span>
            <input
              type="number"
              min={1}
              max={720}
              value={filters.newHours}
              onChange={(e) => set('newHours', Number(e.target.value))}
              className="w-16 border border-gray-300 rounded px-1.5 py-1 text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span>h</span>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">{jobCount} job{jobCount !== 1 ? 's' : ''}</p>
    </div>
  )
}
