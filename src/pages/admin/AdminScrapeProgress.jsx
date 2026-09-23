// src/pages/admin/AdminScrapeProgress.jsx
//
// Live view of the background Blinkit scrape + report-generation loop --
// so "is it working, how much has it done" has a page to check instead
// of asking Claude to read a local log file by hand. Auto-refreshes
// every 30s while the page is open; every number here reads straight
// from the same tables the scraper/report-generator write to.
import { useEffect, useState } from 'react';
import AdminLayout from './AdminLayout';
import { adminScrapeOverview, adminScrapeCategoryProgress } from '../../services/adminScrapeProgressRepo';

const REFRESH_MS = 30_000;

function timeAgo(iso) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-[14px] p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--separator)' }}>
      <p className="text-[11.5px] font-semibold uppercase tracking-wide" style={{ color: 'var(--label-3)' }}>{label}</p>
      <p className="text-[26px] font-bold mt-1" style={{ color: 'var(--label-1)' }}>{value}</p>
      {hint && <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--label-3)' }}>{hint}</p>}
    </div>
  );
}

export default function AdminScrapeProgress() {
  const [overview, setOverview] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [ov, cats] = await Promise.all([adminScrapeOverview(), adminScrapeCategoryProgress()]);
      setOverview(ov);
      setCategories(cats);
      setError('');
      setLastRefreshed(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  // A category updated in the last few minutes is a strong "yes, it's
  // actively running right now" signal -- worth calling out visually
  // rather than making someone compare timestamps themselves.
  const activeNow = categories.length > 0 && (Date.now() - new Date(categories[0].updated_at).getTime()) < 5 * 60 * 1000;

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[22px] font-bold tracking-tight" style={{ color: 'var(--label-1)' }}>
          Scrape progress
        </p>
        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <p className="text-[12px]" style={{ color: 'var(--label-3)' }}>
              Refreshed {lastRefreshed.toLocaleTimeString('en-IN')} · auto-refreshes every 30s
            </p>
          )}
          <button onClick={load} className="tap-scale px-3 py-1.5 rounded-full text-[13px] font-semibold" style={{ background: 'var(--fill)', color: 'var(--label-1)' }}>
            Refresh now
          </button>
        </div>
      </div>
      <p className="text-[12.5px] mb-4" style={{ color: 'var(--label-3)' }}>
        Reads live from the same tables the background scraper and report-generator write to -- not a log file, so this is always current.
      </p>

      {error && <p className="text-[13px] mb-3" style={{ color: 'var(--v-poor)' }}>{error}</p>}
      {loading && <p className="text-[13px]" style={{ color: 'var(--label-3)' }}>Loading…</p>}

      {overview && (
        <>
          <div className="mb-2 flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: activeNow ? 'var(--v-good)' : 'var(--label-3)' }}
            />
            <p className="text-[13px] font-semibold" style={{ color: activeNow ? 'var(--v-good)' : 'var(--label-3)' }}>
              {activeNow ? 'Actively scraping right now' : 'No category updated in the last 5 minutes -- may be paused or between rounds'}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-6">
            <StatCard label="Total Blinkit products" value={overview.totalBlinkitProducts} />
            <StatCard label="Scraped, last hour" value={overview.scrapedLastHour} />
            <StatCard label="Scraped today" value={overview.scrapedToday} />
            <StatCard label="Total reports" value={overview.totalBlinkitReports} />
            <StatCard label="Reports today" value={overview.reportsToday} />
            <StatCard label="Pending reports" value={overview.pendingReports} hint="Scraped, not yet AI-analysed" />
          </div>
        </>
      )}

      <p className="text-[15px] font-bold mb-2" style={{ color: 'var(--label-1)' }}>Category progress</p>
      <p className="text-[12px] mb-3" style={{ color: 'var(--label-3)' }}>Most recently updated first -- the top rows are whatever the loop is working through right now.</p>

      <div className="rounded-[14px] overflow-hidden" style={{ border: '1px solid var(--separator)' }}>
        <table className="w-full text-[13px]">
          <thead>
            <tr style={{ background: 'var(--fill)' }}>
              <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--label-2)' }}>Category</th>
              <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--label-2)' }}>Saved</th>
              <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--label-2)' }}>Status</th>
              <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--label-2)' }}>Updated</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c, i) => (
              <tr key={c.category} style={{ background: i % 2 ? 'transparent' : 'var(--bg-card)', borderTop: '1px solid var(--separator)' }}>
                <td className="px-3 py-2" style={{ color: 'var(--label-1)' }}>{c.category}</td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--label-1)' }}>{c.products_saved}</td>
                <td className="px-3 py-2 text-center">
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      background: c.exhausted ? 'var(--v-good-bg)' : 'var(--fill)',
                      color: c.exhausted ? 'var(--v-good)' : 'var(--label-2)',
                    }}
                  >
                    {c.exhausted ? 'complete' : 'in progress'}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--label-3)' }}>{timeAgo(c.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {categories.length === 0 && !loading && (
          <p className="px-4 py-6 text-center text-[13px]" style={{ color: 'var(--label-3)' }}>No category progress recorded yet.</p>
        )}
      </div>
    </AdminLayout>
  );
}
