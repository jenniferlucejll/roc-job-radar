import { useEffect, useState } from 'react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { fetchEmployers, fetchJobs } from '../api/client.js'
import type { Employer, Job } from '../types/index.js'
import { buildCurrentCounts, buildMonthlyTrend } from '../utils/analytics.js'
import type { MonthlyPoint } from '../utils/analytics.js'

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#6366f1',
]

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function CurrentBarChart({ data }: { data: { name: string; active: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 36)}>
      <BarChart data={data} layout="vertical" margin={{ left: 16, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} />
        <YAxis
          type="category"
          dataKey="name"
          width={140}
          tick={{ fontSize: 11 }}
          tickFormatter={(v: string) => v.length > 20 ? v.slice(0, 18) + '…' : v}
        />
        <Tooltip />
        <Bar dataKey="active" fill={COLORS[0]} radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function TrendLineChart({ data, keys }: { data: MonthlyPoint[]; keys: string[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-gray-400">Not enough historical data to display a trend.</p>
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {keys.map((k, i) => (
          <Line
            key={k}
            type="monotone"
            dataKey={k}
            stroke={COLORS[i % COLORS.length]}
            dot={false}
            strokeWidth={2}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

export function AnalyticsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [employers, setEmployers] = useState<Employer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetchJobs({ status: 'all' }),
      fetchEmployers(true),
    ])
      .then(([j, e]) => {
        setJobs(j)
        setEmployers(e)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const employerMap = new Map(employers.map((e) => [e.id, e.name]))

  // Category analytics
  const categoryCurrentCounts = buildCurrentCounts(jobs, (j) => j.department ?? 'Uncategorized')
  const topCategories = categoryCurrentCounts.slice(0, 5).map((d) => d.name)
  const categoryTrend = buildMonthlyTrend(jobs, (j) => j.department ?? 'Uncategorized', topCategories)

  // Company analytics
  const companyCurrentCounts = buildCurrentCounts(jobs, (j) => employerMap.get(j.employerId) ?? 'Unknown')
  const topCompanies = companyCurrentCounts.map((d) => d.name)
  const companyTrend = buildMonthlyTrend(jobs, (j) => employerMap.get(j.employerId) ?? 'Unknown', topCompanies)

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
        Loading…
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Jobs by Category */}
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Jobs by Category</h2>

          <SectionCard title="Current Active Count by Category">
            {categoryCurrentCounts.length === 0
              ? <p className="text-sm text-gray-400">No data.</p>
              : <CurrentBarChart data={categoryCurrentCounts} />
            }
          </SectionCard>

          {topCategories.length > 0 && (
            <SectionCard title={`Monthly New Jobs — Top ${topCategories.length} Categories`}>
              <TrendLineChart data={categoryTrend} keys={topCategories} />
            </SectionCard>
          )}

          {categoryCurrentCounts.length > 0 && (
            <SectionCard title="Category Summary">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                    <th className="pb-2 pr-4 font-medium">Category</th>
                    <th className="pb-2 pr-4 font-medium">Active</th>
                    <th className="pb-2 font-medium">Total ever seen</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryCurrentCounts.map((row) => {
                    const total = jobs.filter((j) => (j.department ?? 'Uncategorized') === row.name).length
                    return (
                      <tr key={row.name} className="border-b border-gray-50">
                        <td className="py-1.5 pr-4 text-gray-800">{row.name}</td>
                        <td className="py-1.5 pr-4 text-gray-700">{row.active}</td>
                        <td className="py-1.5 text-gray-500">{total}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </SectionCard>
          )}
        </div>

        {/* Jobs by Company */}
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Jobs by Company</h2>

          <SectionCard title="Current Active Count by Company">
            {companyCurrentCounts.length === 0
              ? <p className="text-sm text-gray-400">No data.</p>
              : <CurrentBarChart data={companyCurrentCounts} />
            }
          </SectionCard>

          {topCompanies.length > 0 && (
            <SectionCard title="Monthly New Jobs by Company">
              <TrendLineChart data={companyTrend} keys={topCompanies} />
            </SectionCard>
          )}

          {companyCurrentCounts.length > 0 && (
            <SectionCard title="Company Summary">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                    <th className="pb-2 pr-4 font-medium">Company</th>
                    <th className="pb-2 pr-4 font-medium">Active</th>
                    <th className="pb-2 font-medium">Total ever seen</th>
                  </tr>
                </thead>
                <tbody>
                  {companyCurrentCounts.map((row) => {
                    const total = jobs.filter(
                      (j) => (employerMap.get(j.employerId) ?? 'Unknown') === row.name,
                    ).length
                    return (
                      <tr key={row.name} className="border-b border-gray-50">
                        <td className="py-1.5 pr-4 text-gray-800">{row.name}</td>
                        <td className="py-1.5 pr-4 text-gray-700">{row.active}</td>
                        <td className="py-1.5 text-gray-500">{total}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </SectionCard>
          )}
        </div>

      </div>
    </div>
  )
}
