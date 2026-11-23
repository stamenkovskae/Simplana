import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChartComponent } from './chart.component';
import { ChartSeries } from '../../chart/chart-series';

const data: ChartSeries[] = [
  {
    label: 'Orders',
    points: [
      { t: 1000, v: 1 },
      { t: 2000, v: 4.256 },
    ],
  },
];

describe('ChartComponent', () => {
  let fixture: ComponentFixture<ChartComponent>;
  const el = () => fixture.nativeElement as HTMLElement;
  const set = async (inputs: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    await fixture.whenStable();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ChartComponent] }).compileComponents();
    fixture = TestBed.createComponent(ChartComponent);
  });

  it('shows the empty state without data', async () => {
    await set({ series: [] });
    expect(el().textContent).toContain('No data in this time range. For failure charts that is good news; otherwise check that your API is getting traffic.');
  });

  it('shows a skeleton while loading, even with data', async () => {
    await set({ series: data, loading: true });
    expect(el().querySelector('.skeleton')).toBeTruthy();
  });

  it('shows the error and emits retry', async () => {
    let retried = 0;
    fixture.componentInstance.retry.subscribe(() => retried++);
    await set({ series: data, error: 'boom' });
    expect(el().textContent).toContain('boom');
    el().querySelector('button')!.click();
    expect(retried).toBe(1);
  });

  it('number look shows the latest value of the first series with the unit', async () => {
    await set({ series: data, look: 'number', unit: 'per minute' });
    expect(el().querySelector('strong')!.textContent).toBe('4.26');
    expect(el().textContent).toContain('per minute');
    expect(el().querySelector('canvas')).toBeNull();
  });

  it('line/area/bars render a canvas', async () => {
    for (const look of ['line', 'area', 'bars']) {
      await set({ series: data, look });
      expect(el().querySelector('canvas')).toBeTruthy();
    }
  });
});
