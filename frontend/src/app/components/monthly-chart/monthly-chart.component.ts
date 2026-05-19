import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, effect, input, output, viewChild } from '@angular/core';
import { Chart, ChartConfiguration, registerables, ActiveElement, ChartEvent } from 'chart.js';

Chart.register(...registerables);

export interface MonthlyBar { label: string; total: number; }

@Component({
  selector: 'app-monthly-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './monthly-chart.component.html',
  styleUrl: './monthly-chart.component.scss'
})
export class MonthlyChartComponent implements AfterViewInit, OnDestroy {
  readonly data = input.required<MonthlyBar[]>();
  readonly monthClick = output<number>();
  private canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart?: Chart;

  constructor() {
    effect(() => {
      const bars = this.data();
      if (this.chart) {
        this.chart.data.labels = bars.map(b => b.label);
        this.chart.data.datasets[0].data = bars.map(b => b.total);
        this.chart.update();
      }
    });
  }

  ngAfterViewInit() {
    this.chart = new Chart(this.canvas().nativeElement, {
      type: 'bar',
      data: {
        labels: this.data().map(b => b.label),
        datasets: [{
          label: 'Harcamalar',
          data: this.data().map(b => b.total),
          backgroundColor: '#1c1b1b',
          hoverBackgroundColor: '#476550',
          borderRadius: 6,
          borderSkipped: false,
        }],
      } as ChartConfiguration<'bar'>['data'],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (_event: ChartEvent, elements: ActiveElement[]) => {
          if (elements.length > 0) {
            const idx = elements[0].index;
            this.monthClick.emit(idx);
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ₺${(ctx.parsed.y ?? 0).toLocaleString('tr-TR')}`
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 11 } } },
          y: { grid: { color: '#e2e3e1' }, ticks: { font: { family: 'JetBrains Mono', size: 11 } } }
        }
      },
    });
  }

  ngOnDestroy() { this.chart?.destroy(); }
}
