import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BaseChartDirective, provideCharts } from 'ng2-charts';
import {
  BarController,
  BarElement,
  CategoryScale,
  ChartConfiguration,
  Chart,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Plugin,
  Tooltip,
} from 'chart.js';
import { ChartSeries } from '../../chart/chart-series';
import { GUIDE_DASH, SERIES_DASHES, SOLID } from '../../chart/dashes';
import { INK, INK_08, INK_25, PURPLE, RED, TEAL, WHITE } from '../../chart/colors';

export type ChartLook = 'line' | 'area' | 'bars' | 'number';

const FALLBACK_COLORS = [RED, TEAL, PURPLE];

const fmtNumber = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 });
const fmtTime = (t: number) =>
  new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Last non-NaN drawn point of a dataset (NaN = gap), or undefined if hidden/empty. */
function lastDrawn(chart: Chart, i: number): { x: number; y: number } | undefined {
  const meta = chart.getDatasetMeta(i);
  if (meta.hidden) return undefined;
  return [...meta.data].reverse().find((p) => Number.isFinite(p.y));
}

/** Direct end-of-line labels (replaces the legend) + dashed hover guide line. */
const decorations: Plugin = {
  id: 'simplanaDecorations',
  afterDatasetsDraw(chart) {
    const { ctx, chartArea, tooltip } = chart;
    ctx.save();
    const active = tooltip?.getActiveElements?.() ?? [];
    if (active.length) {
      const x = active[0].element.x;
      ctx.strokeStyle = INK_25;
      ctx.lineWidth = 2;
      ctx.setLineDash(GUIDE_DASH);
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.setLineDash(SOLID);
    }
    ctx.font = '600 13px "Bricolage Grotesque", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    // label y positions, nudged so labels at least 16px apart never overlap
    const ends = chart.data.datasets
      .map((_, i) => ({ i, last: lastDrawn(chart, i) }))
      .filter((e): e is { i: number; last: { x: number; y: number } } => !!e.last)
      .sort((a, b) => a.last.y - b.last.y);
    const labelY = new Map<number, number>();
    ends.forEach((e, n) => {
      const prev = n ? labelY.get(ends[n - 1].i)! : -Infinity;
      labelY.set(e.i, Math.max(e.last.y, prev + 16));
    });
    ends.forEach(({ i, last }) => {
      const ds = chart.data.datasets[i];
      const color = ds.borderColor as string;
      ctx.fillStyle = WHITE;
      ctx.strokeStyle = WHITE;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(last.x, last.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.textAlign = 'left';
      ctx.fillText(ds.label ?? '', last.x + 14, labelY.get(i)!);
    });
    ctx.restore();
  },
};

@Component({
  selector: 'app-chart',
  imports: [BaseChartDirective],
  // register only what we draw (keeps the bundle small)
  providers: [
    provideCharts({
      registerables: [
        LineController,
        BarController,
        LineElement,
        BarElement,
        PointElement,
        LinearScale,
        CategoryScale,
        Filler,
        Tooltip,
      ],
    }),
  ],
  templateUrl: './chart.component.html',
  styleUrl: './chart.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartComponent {
  readonly series = input<ChartSeries[]>([]);
  readonly look = input<ChartLook>('line');
  readonly unit = input('');
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly retry = output<void>();

  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** loading > error > empty > ready */
  readonly state = computed<'loading' | 'error' | 'empty' | 'ready'>(() => {
    if (this.loading()) return 'loading';
    if (this.error()) return 'error';
    return this.series().some((s) => s.points.length) ? 'ready' : 'empty';
  });

  readonly bigNumber = computed(() => {
    const v = this.series()[0]?.points.at(-1)?.v;
    return v === undefined || !Number.isFinite(v) ? '–' : fmtNumber(v);
  });

  readonly plugins = [decorations];

  readonly config = computed<ChartConfiguration<'line' | 'bar'>>(() => {
    const look = this.look();
    const series = this.series();
    const colors = this.colors();
    const bars = look === 'bars';
    const common = (s: ChartSeries, i: number) => ({
      label: s.label,
      borderColor: colors[i % colors.length],
    });
    const datasets = series.map((s, i) =>
      bars
        ? {
            ...common(s, i),
            data: s.points.map((p) => (Number.isFinite(p.v) ? p.v : null)),
            backgroundColor: colors[i % colors.length],
            borderRadius: 8,
            borderSkipped: false,
          }
        : {
            ...common(s, i),
            data: s.points.map((p) => ({ x: p.t, y: Number.isFinite(p.v) ? p.v : NaN })),
            spanGaps: false,
            borderWidth: 4,
            borderCapStyle: 'round' as const,
            borderJoinStyle: 'round' as const,
            borderDash: SERIES_DASHES[i % SERIES_DASHES.length],
            tension: 0.35,
            pointRadius: 0,
            pointHoverRadius: 7,
            pointHoverBackgroundColor: colors[i % colors.length],
            pointHoverBorderColor: WHITE,
            pointHoverBorderWidth: 3,
            // faint area fill on the first series only
            fill: look === 'area' && i === 0 ? 'origin' : false,
            backgroundColor: `color-mix(in oklch, ${colors[i % colors.length]} 20%, transparent)`,
          },
    );
    return {
      type: bars ? 'bar' : 'line',
      data: {
        // ponytail: bars assume all series share timestamps (true for Prometheus query_range)
        labels: bars ? (series[0]?.points ?? []).map((p) => fmtTime(p.t)) : undefined,
        datasets,
      } as ChartConfiguration<'line' | 'bar'>['data'],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: this.reducedMotion() ? false : { duration: 400 },
        layout: { padding: { right: 130, top: 8, bottom: 8 } },
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: bars
            ? { grid: { display: false }, border: { display: false } }
            : {
                type: 'linear',
                grid: { display: false },
                border: { display: false },
                ticks: { maxTicksLimit: 6, callback: (v) => fmtTime(Number(v)) },
              },
          y: {
            beginAtZero: true,
            border: { display: false },
            grid: { color: INK_08, lineWidth: 2 },
            ticks: { maxTicksLimit: 5, callback: (v) => fmtNumber(Number(v)) },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: INK,
            cornerRadius: 12,
            padding: 10,
            titleFont: { family: 'Bricolage Grotesque, system-ui', weight: 'bold' },
            bodyFont: { family: 'Bricolage Grotesque, system-ui' },
            callbacks: {
              title: (items) => {
                const x = (items[0]?.raw as { x?: number })?.x;
                return x === undefined ? (items[0]?.label ?? '') : fmtTime(x);
              },
              label: (c) => {
                const y = typeof c.raw === 'number' ? c.raw : (c.raw as { y: number }).y;
                return `${c.dataset.label}: ${fmtNumber(y)} ${this.unit()}`.trim();
              },
            },
          },
        },
      },
    };
  });

  // Only called while state() is ready, which can only render in the browser.
  private colors(): string[] {
    if (!this.browser) return FALLBACK_COLORS;
    const css = getComputedStyle(document.documentElement);
    return FALLBACK_COLORS.map((f, i) => css.getPropertyValue(`--s${i + 1}`).trim() || f);
  }

  private reducedMotion(): boolean {
    return this.browser && !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  }
}
