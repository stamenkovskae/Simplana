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
  TooltipItem,
} from 'chart.js';
import { ChartSeries } from '../../chart/chart-series';
import { GUIDE_DASH, SERIES_DASHES, SOLID } from '../../chart/dashes';
import { INK, INK_08, INK_25, PURPLE, RED, TEAL, WHITE } from '../../chart/colors';

export type ChartLook = 'line' | 'area' | 'bars' | 'number';

const FALLBACK_COLORS = [RED, TEAL, PURPLE];

const fmtNumber = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 });
const fmtTime = (t: number) =>
  new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

type Point = { x: number; y: number };
type LineEnd = { i: number; last: Point };

const LABEL_GAP = 16;

function lastDrawn(chart: Chart, i: number): Point | undefined {
  const meta = chart.getDatasetMeta(i);
  if (meta.hidden) return undefined;
  return [...meta.data].reverse().find((p) => Number.isFinite(p.y));
}

/** Dashed vertical guide under the hovered point. */
function drawGuide({ ctx, chartArea, tooltip }: Chart) {
  const active = tooltip?.getActiveElements?.() ?? [];
  if (!active.length) return;
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

function lineEnds(chart: Chart): LineEnd[] {
  return chart.data.datasets
    .map((_, i) => ({ i, last: lastDrawn(chart, i) }))
    .filter((e): e is LineEnd => !!e.last)
    .sort((a, b) => a.last.y - b.last.y);
}

function labelPositions(ends: LineEnd[]): Map<number, number> {
  const labelY = new Map<number, number>();
  let prev = -Infinity;
  for (const { i, last } of ends) {
    prev = Math.max(last.y, prev + LABEL_GAP);
    labelY.set(i, prev);
  }
  return labelY;
}

function drawEnd(ctx: CanvasRenderingContext2D, color: string, name: string, p: Point, y: number) {
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.fillText(name, p.x + 14, y);
}

const decorations: Plugin = {
  id: 'simplanaDecorations',
  afterDatasetsDraw(chart) {
    const { ctx, data } = chart;
    ctx.save();
    drawGuide(chart);
    ctx.font = '600 13px "Bricolage Grotesque", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const ends = lineEnds(chart);
    const labelY = labelPositions(ends);
    for (const { i, last } of ends) {
      const ds = data.datasets[i];
      drawEnd(ctx, ds.borderColor as string, ds.label ?? '', last, labelY.get(i)!);
    }
    ctx.restore();
  },
};

const finiteOr = <T>(v: number, fallback: T) => (Number.isFinite(v) ? v : fallback);

const barDataset = (s: ChartSeries, color: string) => ({
  label: s.label,
  borderColor: color,
  backgroundColor: color,
  data: s.points.map((p) => finiteOr(p.v, null)),
  borderRadius: 8,
  borderSkipped: false,
});

const lineDataset = (s: ChartSeries, i: number, color: string, filled: boolean) => ({
  label: s.label,
  borderColor: color,
  backgroundColor: `color-mix(in oklch, ${color} 20%, transparent)`,
  data: s.points.map((p) => ({ x: p.t, y: finiteOr(p.v, NaN) })),
  spanGaps: false,
  borderWidth: 4,
  borderCapStyle: 'round' as const,
  borderJoinStyle: 'round' as const,
  borderDash: SERIES_DASHES[i % SERIES_DASHES.length],
  tension: 0.35,
  pointRadius: 0,
  pointHoverRadius: 7,
  pointHoverBackgroundColor: color,
  pointHoverBorderColor: WHITE,
  pointHoverBorderWidth: 3,
  fill: filled ? ('origin' as const) : false,
});

const NO_GRID = { grid: { display: false }, border: { display: false } };

const xScale = (bars: boolean) =>
  bars
    ? NO_GRID
    : {
        ...NO_GRID,
        type: 'linear' as const,
        ticks: { maxTicksLimit: 6, callback: (v: string | number) => fmtTime(Number(v)) },
      };

const Y_SCALE = {
  beginAtZero: true,
  border: { display: false },
  grid: { color: INK_08, lineWidth: 2 },
  ticks: { maxTicksLimit: 5, callback: (v: string | number) => fmtNumber(Number(v)) },
};

const tooltipOptions = (unit: () => string) => ({
  backgroundColor: INK,
  cornerRadius: 12,
  padding: 10,
  titleFont: { family: 'Bricolage Grotesque, system-ui', weight: 'bold' as const },
  bodyFont: { family: 'Bricolage Grotesque, system-ui' },
  callbacks: {
    title: (items: TooltipItem<'line' | 'bar'>[]) => {
      const x = (items[0]?.raw as { x?: number })?.x;
      return x === undefined ? (items[0]?.label ?? '') : fmtTime(x);
    },
    label: (c: TooltipItem<'line' | 'bar'>) => {
      const y = typeof c.raw === 'number' ? c.raw : (c.raw as { y: number }).y;
      return `${c.dataset.label}: ${fmtNumber(y)} ${unit()}`.trim();
    },
  },
});

@Component({
  selector: 'app-chart',
  imports: [BaseChartDirective],
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
    const datasets = series.map((s, i) => {
      const color = colors[i % colors.length];
      return bars ? barDataset(s, color) : lineDataset(s, i, color, look === 'area' && i === 0);
    });
    return {
      type: bars ? 'bar' : 'line',
      data: {
        labels: bars ? (series[0]?.points ?? []).map((p) => fmtTime(p.t)) : undefined,
        datasets,
      } as ChartConfiguration<'line' | 'bar'>['data'],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: this.reducedMotion() ? false : { duration: 400 },
        layout: { padding: { right: 130, top: 8, bottom: 8 } },
        interaction: { mode: 'index', intersect: false },
        scales: { x: xScale(bars), y: Y_SCALE },
        plugins: { legend: { display: false }, tooltip: tooltipOptions(() => this.unit()) },
      },
    };
  });

  private colors(): string[] {
    if (!this.browser) return FALLBACK_COLORS;
    const css = getComputedStyle(document.documentElement);
    return FALLBACK_COLORS.map((f, i) => css.getPropertyValue(`--s${i + 1}`).trim() || f);
  }

  private reducedMotion(): boolean {
    return this.browser && !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  }
}
