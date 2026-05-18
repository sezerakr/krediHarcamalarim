import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { HttpClient } from '@angular/common/http';
import { Statement, Transaction } from '../../models/statement.model';
import { BankFilter } from '../../models/bank.model';
import { SummaryCardComponent } from '../../components/summary-card/summary-card.component';
import { MonthlyChartComponent } from '../../components/monthly-chart/monthly-chart.component';
import { CategoryChartComponent } from '../../components/category-chart/category-chart.component';
import { CATEGORY_COLORS, TURKISH_MONTHS } from '../../core/constants';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SummaryCardComponent, MonthlyChartComponent, CategoryChartComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  private http = inject(HttpClient);

  readonly selectedBank = signal<BankFilter>('ALL');

  protected onBankChange(e: Event) {
    this.selectedBank.set((e.target as HTMLSelectElement).value as BankFilter);
  }

  private statementsResource = httpResource<{ statements: Statement[] }>(() =>
    'http://localhost:3000/api/statements'
  );

  private txResource = httpResource<{ transactions: Transaction[] }>(() =>
    'http://localhost:3000/api/transactions'
  );

  private allTx = computed<Transaction[]>(() => this.txResource.value()?.transactions ?? []);

  private filteredTx = computed<Transaction[]>(() => {
    const bank = this.selectedBank();
    const all = this.allTx();
    return bank === 'ALL' ? all : all.filter(t => t.bankName === bank);
  });

  readonly totalExpense = computed(() =>
    this.filteredTx().filter(t => t.transactionType === 'EXPENSE').reduce((s, t) => s + t.amount, 0)
  );

  readonly totalIncome = computed(() =>
    this.filteredTx().filter(t => t.transactionType === 'INCOME').reduce((s, t) => s + t.amount, 0)
  );

  readonly subscriptionCount = computed(() =>
    this.filteredTx().filter(t => t.isMonthlySubscription === 1).length
  );

  readonly statementCount = computed(() =>
    this.statementsResource.value()?.statements.length ?? 0
  );

  readonly byMonth = computed(() => {
    const buckets = new Array(12).fill(0);
    for (const t of this.filteredTx()) {
      if (t.transactionType !== 'EXPENSE') continue;
      const date = new Date(t.transactionDate);
      if (!isNaN(date.getTime())) {
        const m = date.getMonth();
        buckets[m] += t.amount;
      }
    }
    return TURKISH_MONTHS.map((label, i) => ({ label, total: buckets[i] }));
  });

  readonly byCategory = computed(() => {
    const map = new Map<string, number>();
    for (const t of this.filteredTx()) {
      if (t.transactionType !== 'EXPENSE') continue;
      const k = t.category ?? 'Diğer';
      map.set(k, (map.get(k) ?? 0) + t.amount);
    }
    return [...map.entries()].map(([label, total]) => ({
      label,
      total,
      color: CATEGORY_COLORS[label] ?? CATEGORY_COLORS['Diğer'],
    }));
  });
}
