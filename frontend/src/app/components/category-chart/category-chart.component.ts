import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, effect, input, viewChild } from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

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
    this.chart = new Chart(this.canvas().nativeElement, {
      type: 'doughnut',
      data: {
        labels: this.data().map(s => s.label),
        datasets: [{
          data: this.data().map(s => s.total),
          backgroundColor: this.data().map(s => s.color),
        }],
      } as ChartConfiguration<'doughnut'>['data'],
      options: { responsive: true, maintainAspectRatio: false },
    });
  }

  ngOnDestroy() { this.chart?.destroy(); }
}
