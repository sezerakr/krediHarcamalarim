import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, effect, input, output, viewChild } from '@angular/core';
import { Chart, ChartConfiguration, registerables, ActiveElement, ChartEvent } from 'chart.js';

Chart.register(...registerables);

export interface CategorySlice { label: string; total: number; color: string; }

@Component({
  selector: 'app-category-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './category-chart.component.html',
  styleUrl: './category-chart.component.scss'
})
export class CategoryChartComponent implements AfterViewInit, OnDestroy {
  readonly data = input.required<CategorySlice[]>();
  readonly categoryClick = output<string>();
  private canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart?: Chart;

  constructor() {
    effect(() => {
      const slices = this.data();
      if (this.chart) {
        this.chart.data.labels = slices.map(s => s.label);
        this.chart.data.datasets[0].data = slices.map(s => s.total);
        this.chart.data.datasets[0].backgroundColor = slices.map(s => s.color);
        this.chart.update();
      }
    });
  }

  ngAfterViewInit() {
    const config: ChartConfiguration<'doughnut'> = {
      type: 'doughnut',
      data: {
        labels: this.data().map(s => s.label),
        datasets: [{
          data: this.data().map(s => s.total),
          backgroundColor: this.data().map(s => s.color),
          hoverOffset: 8,
          borderWidth: 2,
          borderColor: '#ffffff',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        onClick: (_event: ChartEvent, elements: ActiveElement[]) => {
          if (elements.length > 0) {
            const idx = elements[0].index;
            const label = this.data()[idx]?.label;
            if (label) this.categoryClick.emit(label);
          }
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { font: { family: 'Inter', size: 11 }, padding: 16, usePointStyle: true, pointStyleWidth: 8 }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const val = ctx.parsed;
                const total = (ctx.dataset.data as number[]).reduce((a, b) => a + b, 0);
                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0';
                return ` ${ctx.label}: ₺${val.toLocaleString('tr-TR')} (${pct}%)`;
              }
            }
          }
        }
      },
    };
    this.chart = new Chart(this.canvas().nativeElement, config as any);
  }

  ngOnDestroy() { this.chart?.destroy(); }
}
