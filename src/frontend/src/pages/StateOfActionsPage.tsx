import React, { useEffect, useState, useMemo } from 'react';
import { Action, ActionStats } from '../types/Action';
import { actionsService } from '../services/actionsService';
import { AnimatedCounter } from '../components/AnimatedCounter';
import { NavBar } from '../components/NavBar';

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface ComputedStats {
  criticalVulnCount: number;
  highVulnCount: number;
  ossfScoreBands: number[];
  avgOssfScore: number;
  nodeVersions: Record<string, number>;
  lastUpdatedBands: { label: string; count: number }[];
  archivedCount: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function computeStats(actions: Action[]): ComputedStats {
  const total = actions.length;
  if (total === 0) {
    return {
      criticalVulnCount: 0,
      highVulnCount: 0,
      ossfScoreBands: [0, 0, 0, 0, 0],
      avgOssfScore: 0,
      nodeVersions: {},
      lastUpdatedBands: [],
      archivedCount: 0,
    };
  }

  let criticalVulnCount = 0;
  let highVulnCount = 0;
  // bands: 0-2, 2-4, 4-6, 6-8, 8-10
  const ossfScoreBands = [0, 0, 0, 0, 0];
  let ossfScoreSum = 0;
  let ossfScoreActionCount = 0;
  const nodeVersions: Record<string, number> = {};
  let archivedCount = 0;

  const now = Date.now();
  const bandCounts = [0, 0, 0, 0, 0]; // <7d, 7-30d, 30-90d, 90-365d, >365d

  for (const a of actions) {
    if (a.vulnerabilityStatus?.critical > 0) criticalVulnCount++;
    if (a.vulnerabilityStatus?.high > 0) highVulnCount++;

    if (a.ossf && typeof a.ossfScore === 'number' && a.ossfScore > 0) {
      const band = Math.min(Math.floor(a.ossfScore / 2), 4);
      ossfScoreBands[band]++;
      ossfScoreSum += a.ossfScore;
      ossfScoreActionCount++;
    }

    if (a.actionType?.actionType === 'Node' && a.actionType.nodeVersion) {
      const ver = a.actionType.nodeVersion;
      nodeVersions[ver] = (nodeVersions[ver] || 0) + 1;
    }

    if (a.repoInfo?.archived) archivedCount++;

    const updatedStr = a.repoInfo?.updated_at;
    if (updatedStr) {
      const ms = Date.now() - new Date(updatedStr).getTime();
      const days = ms / 86400000;
      if (days < 7) bandCounts[0]++;
      else if (days < 30) bandCounts[1]++;
      else if (days < 90) bandCounts[2]++;
      else if (days < 365) bandCounts[3]++;
      else bandCounts[4]++;
    }
  }

  void now; // suppress unused warning

  return {
    criticalVulnCount,
    highVulnCount,
    ossfScoreBands,
    avgOssfScore: ossfScoreActionCount > 0 ? ossfScoreSum / ossfScoreActionCount : 0,
    nodeVersions,
    lastUpdatedBands: [
      { label: 'Within 7 days', count: bandCounts[0] },
      { label: '7-30 days', count: bandCounts[1] },
      { label: '30-90 days', count: bandCounts[2] },
      { label: '90-365 days', count: bandCounts[3] },
      { label: 'Over 1 year', count: bandCounts[4] },
    ],
    archivedCount,
  };
}

function pct(count: number, total: number): string {
  if (total === 0) return '0%';
  return Math.round((count / total) * 100) + '%';
}

/* ------------------------------------------------------------------ */
/*  SVG Donut Chart                                                     */
/* ------------------------------------------------------------------ */

interface DonutSlice {
  value: number;
  color: string;
  label: string;
}

interface DonutChartProps {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
}

const DonutChart: React.FC<DonutChartProps> = ({ slices, size = 160, thickness = 28 }) => {
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  if (total === 0) return <div className="soa-donut" />;

  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  const paths = slices
    .filter(sl => sl.value > 0)
    .map((sl) => {
      const dash = (sl.value / total) * circumference;
      const gap = circumference - dash;
      const rotate = (offset / total) * 360 - 90;
      offset += sl.value;
      return { sl, dash, gap, rotate };
    });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="soa-donut">
      {paths.map(({ sl, dash, gap, rotate }, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={sl.color}
          strokeWidth={thickness}
          strokeDasharray={`${dash} ${gap}`}
          transform={`rotate(${rotate} ${cx} ${cy})`}
          strokeLinecap="butt"
        />
      ))}
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/*  Bar chart row                                                       */
/* ------------------------------------------------------------------ */

interface BarRowProps {
  label: string;
  count: number;
  total: number;
  color: string;
}

const BarRow: React.FC<BarRowProps> = ({ label, count, total, color }) => {
  const p = total > 0 ? Math.max((count / total) * 100, count > 0 ? 1 : 0) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
        <span style={{ color: 'var(--c-text-2)' }}>{label}</span>
        <span className="soa-pct-label">{count.toLocaleString()} <span style={{ color: 'var(--c-text-3)' }}>({pct(count, total)})</span></span>
      </div>
      <div className="soa-bar-track">
        <div className="soa-bar-fill" style={{ width: `${p}%`, background: color }} />
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Security card                                                        */
/* ------------------------------------------------------------------ */

interface SecurityCardProps {
  title: string;
  count: number;
  total: number;
  color: string;
  subtitle: string;
}

const SecurityCard: React.FC<SecurityCardProps> = ({ title, count, total, color, subtitle }) => (
  <div className="soa-card" style={{ borderTop: `3px solid ${color}` }}>
    <div className="soa-card-title">{title}</div>
    <div className="soa-metric" style={{ color }}><AnimatedCounter value={count} /></div>
    <div className="soa-metric-label">{pct(count, total)} of actions</div>
    <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 6 }}>{subtitle}</div>
  </div>
);

/* ------------------------------------------------------------------ */
/*  Main page                                                           */
/* ------------------------------------------------------------------ */

export const StateOfActionsPage: React.FC = () => {
  const [stats, setStats] = useState<ActionStats | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingActions, setLoadingActions] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  useEffect(() => {
    actionsService.fetchStats()
      .then(s => { setStats(s); setLoadingStats(false); })
      .catch(() => { setStatsError('Failed to load stats.'); setLoadingStats(false); });
  }, []);

  useEffect(() => {
    actionsService.fetchActions()
      .then(a => { setActions(a); setLoadingActions(false); })
      .catch(() => setLoadingActions(false));
  }, []);

  const computed = useMemo(() => computeStats(actions), [actions]);

  const total = stats?.total ?? actions.length;

  const donutSlices: DonutSlice[] = stats
    ? [
        { label: 'Node', value: stats.byType['Node'] ?? 0, color: 'var(--c-green)' },
        { label: 'Docker', value: stats.byType['Docker'] ?? 0, color: 'var(--c-sky)' },
        { label: 'Composite', value: stats.byType['Composite'] ?? 0, color: 'var(--c-purple)' },
      ]
    : [];

  const topNodeVersions = Object.entries(computed.nodeVersions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const nodeTotal = topNodeVersions.reduce((s, [, v]) => s + v, 0);

  const ossfBandLabels = ['0-2', '2-4', '4-6', '6-8', '8-10'];
  const ossfColors = ['var(--c-red)', 'var(--c-amber)', 'var(--c-sky)', 'var(--c-green)', 'var(--c-green)'];
  const maxOssfBand = Math.max(...computed.ossfScoreBands, 1);

  const updateColors = ['var(--c-green)', 'var(--c-sky)', 'var(--c-amber)', 'var(--c-red)', 'var(--c-red)'];

  return (
    <div className="app">
      <div className="header">
        <NavBar />
        <h1>State of GitHub Actions</h1>
        <p>
          {loadingActions
            ? 'Loading data...'
            : `Insights from ${total.toLocaleString()} actions in the marketplace`}
        </p>
      </div>

      {(loadingStats || loadingActions) && (
        <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginBottom: 16 }}>
          {loadingStats && 'Loading stats... '}
          {loadingActions && 'Loading full actions list (this may take a moment)...'}
        </div>
      )}

      {statsError && <div className="error-message">{statsError}</div>}

      {/* Key metrics */}
      <div className="soa-section-title">Key Metrics</div>
      <div className="soa-grid soa-grid-4">
        <div className="soa-card">
          <div className="soa-card-title">Total Actions</div>
          <div className="soa-metric"><AnimatedCounter value={total} /></div>
          <div className="soa-metric-label">in the marketplace</div>
        </div>
        <div className="soa-card">
          <div className="soa-card-title">Verified Actions</div>
          <div className="soa-metric" style={{ color: 'var(--c-green)' }}>
            <AnimatedCounter value={stats?.verified ?? 0} />
          </div>
          <div className="soa-metric-label">{pct(stats?.verified ?? 0, total)} verified</div>
        </div>
        <div className="soa-card">
          <div className="soa-card-title">Archived</div>
          <div className="soa-metric" style={{ color: 'var(--c-red)' }}>
            <AnimatedCounter value={loadingActions ? (stats?.archived ?? 0) : computed.archivedCount} />
          </div>
          <div className="soa-metric-label">
            {pct(loadingActions ? (stats?.archived ?? 0) : computed.archivedCount, total)} archived
          </div>
        </div>
        <div className="soa-card">
          <div className="soa-card-title">With OpenSSF Score</div>
          <div className="soa-metric" style={{ color: 'var(--c-sky)' }}>
            <AnimatedCounter value={stats?.withOssf ?? 0} />
          </div>
          <div className="soa-metric-label">{pct(stats?.withOssf ?? 0, total)} have OSSF data</div>
        </div>
      </div>

      {/* Action types */}
      <div className="soa-section-title">Action Types</div>
      <div className="soa-grid soa-grid-2">
        <div className="soa-card" style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <DonutChart slices={donutSlices} size={160} thickness={30} />
          <div style={{ flex: 1 }}>
            {donutSlices.map(sl => (
              <div key={sl.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span className="soa-legend-dot" style={{ background: sl.color }} />
                <span style={{ flex: 1, fontSize: 14, color: 'var(--c-text-2)' }}>{sl.label}</span>
                <span style={{ fontWeight: 700, color: 'var(--c-text)' }}>
                  {sl.value.toLocaleString()}
                </span>
                <span style={{ fontSize: 12, color: 'var(--c-text-3)', minWidth: 42, textAlign: 'right' }}>
                  {pct(sl.value, total)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="soa-card">
          <div className="soa-card-title">Distribution</div>
          {donutSlices.map(sl => (
            <BarRow key={sl.label} label={sl.label} count={sl.value} total={total} color={sl.color} />
          ))}
        </div>
      </div>

      {/* Security overview */}
      <div className="soa-section-title">Security Overview</div>
      <div className="soa-grid soa-grid-2">
        <SecurityCard
          title="Critical Vulnerabilities"
          count={computed.criticalVulnCount}
          total={total}
          color="var(--c-red)"
          subtitle="Actions with at least one critical CVE"
        />
        <SecurityCard
          title="High Vulnerabilities"
          count={computed.highVulnCount}
          total={total}
          color="var(--c-amber)"
          subtitle="Actions with at least one high CVE"
        />
      </div>

      {/* OpenSSF score distribution */}
      <div className="soa-section-title">OpenSSF Score Distribution</div>
      <div className="soa-grid soa-grid-2">
        <div className="soa-card">
          <div className="soa-card-title">Score Bands</div>
          {ossfBandLabels.map((label, i) => (
            <div key={label} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                <span style={{ color: 'var(--c-text-2)', minWidth: 36 }}>{label}</span>
                <span className="soa-pct-label">{computed.ossfScoreBands[i].toLocaleString()}</span>
              </div>
              <div className="soa-bar-track">
                <div
                  className="soa-bar-fill"
                  style={{
                    width: `${maxOssfBand > 0 ? (computed.ossfScoreBands[i] / maxOssfBand) * 100 : 0}%`,
                    background: ossfColors[i]
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="soa-card">
          <div className="soa-card-title">Average Score</div>
          <div className="soa-metric" style={{ color: computed.avgOssfScore >= 5 ? 'var(--c-green)' : 'var(--c-amber)', fontSize: 52 }}>
            {computed.avgOssfScore > 0 ? computed.avgOssfScore.toFixed(1) : '—'}
          </div>
          <div className="soa-metric-label">out of 10.0</div>
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 13, color: 'var(--c-text-2)', marginBottom: 8 }}>Score interpretation</div>
            {[['8-10', 'Excellent', 'var(--c-green)'], ['6-8', 'Good', 'var(--c-sky)'], ['4-6', 'Fair', 'var(--c-amber)'], ['0-4', 'Needs work', 'var(--c-red)']].map(([range, label, color]) => (
              <div key={range} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span className="soa-legend-dot" style={{ background: color }} />
                <span style={{ fontSize: 13, color: 'var(--c-text-2)' }}>{range}: {label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Node.js versions */}
      {topNodeVersions.length > 0 && (
        <>
          <div className="soa-section-title">Node.js Version Distribution</div>
          <div className="soa-card">
            <div className="soa-card-title">Top Node.js runtimes used in Node-type actions</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, marginTop: 12 }}>
              {topNodeVersions.map(([ver, count]) => (
                <div key={ver}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span style={{ color: 'var(--c-text)', fontWeight: 600 }}>node{ver}</span>
                    <span className="soa-pct-label">{count.toLocaleString()} ({pct(count, nodeTotal)})</span>
                  </div>
                  <div className="soa-bar-track">
                    <div
                      className="soa-bar-fill"
                      style={{
                        width: `${(count / (topNodeVersions[0]?.[1] ?? 1)) * 100}%`,
                        background: 'var(--c-green)'
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Maintenance */}
      <div className="soa-section-title">Maintenance Activity</div>
      <div className="soa-grid soa-grid-2">
        <div className="soa-card">
          <div className="soa-card-title">Last Updated Distribution</div>
          {computed.lastUpdatedBands.map((band, i) => (
            <BarRow key={band.label} label={band.label} count={band.count} total={total} color={updateColors[i]} />
          ))}
        </div>
        <div className="soa-card">
          <div className="soa-card-title">Repository Status</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
            <div>
              <div style={{ fontSize: 13, color: 'var(--c-text-2)', marginBottom: 6 }}>Active vs Archived</div>
              <div style={{ display: 'flex', gap: 16 }}>
                <div>
                  <div className="soa-metric" style={{ fontSize: 32, color: 'var(--c-green)' }}>
                    <AnimatedCounter value={total - computed.archivedCount} />
                  </div>
                  <div className="soa-metric-label">Active</div>
                </div>
                <div>
                  <div className="soa-metric" style={{ fontSize: 32, color: 'var(--c-red)' }}>
                    <AnimatedCounter value={computed.archivedCount} />
                  </div>
                  <div className="soa-metric-label">Archived</div>
                </div>
              </div>
            </div>
            <div className="soa-bar-track" style={{ marginTop: 4 }}>
              <div
                className="soa-bar-fill"
                style={{
                  width: `${pct(total - computed.archivedCount, total)}`,
                  background: 'var(--c-green)'
                }}
              />
            </div>
            <div style={{ fontSize: 12, color: 'var(--c-text-3)' }}>
              {pct(computed.archivedCount, total)} of all actions are archived
            </div>
          </div>
        </div>
      </div>

      {loadingActions && (
        <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 13, color: 'var(--c-text-3)' }}>
          Full dataset still loading — security and maintenance sections will update shortly.
        </div>
      )}
    </div>
  );
};
