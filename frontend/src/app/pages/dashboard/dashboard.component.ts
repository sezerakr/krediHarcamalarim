import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { HttpClient } from '@angular/common/http';
import { Statement, Transaction, PredictionResponse } from '../../models/statement.model';
import { BankFilter } from '../../models/bank.model';
import { SummaryCardComponent } from '../../components/summary-card/summary-card.component';
import { MonthlyChartComponent } from '../../components/monthly-chart/monthly-chart.component';
import { CategoryChartComponent } from '../../components/category-chart/category-chart.component';
import { CATEGORY_COLORS, TURKISH_MONTHS } from '../../core/constants';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SummaryCardComponent, MonthlyChartComponent, CategoryChartComponent, CurrencyPipe, DecimalPipe, RouterLink, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  private http = inject(HttpClient);

  // ---- Top-level filters ----
  readonly selectedBank = signal<BankFilter>('ALL');
  readonly selectedPeriod = signal<string>('ALL');

  // ---- Table Filters ----
  readonly filterCategory = signal<string>('');
  readonly filterMonth = signal<string>('');
  readonly filterType = signal<string>('');
  readonly filterSearch = signal<string>('');

  // ---- Pagination ----
  readonly currentPage = signal(1);
  readonly pageSize = 15;

  // ---- Constants for template ----
  readonly MONTHS = TURKISH_MONTHS;

  // ---- Data Resources ----
  private statementsResource = httpResource<{ statements: Statement[] }>(() =>
    'http://localhost:3000/api/statements'
  );

  private txResource = httpResource<{ transactions: Transaction[] }>(() =>
    'http://localhost:3000/api/statements/transactions'
  );

  protected predictionResource = httpResource<PredictionResponse>(() =>
    'http://localhost:3000/api/predictions'
  );

  protected prediction = computed(() => this.predictionResource.value());
  protected predictionLoading = computed(() => this.predictionResource.isLoading());

  // ---- Derived Data ----
  private allTx = computed<Transaction[]>(() => this.txResource.value()?.transactions ?? []);

  private globalFilteredTx = computed<Transaction[]>(() => {
    const bank = this.selectedBank();
    const period = this.selectedPeriod();
    const all = this.allTx();
    return all.filter(t => {
      const matchBank = bank === 'ALL' || t.bankName === bank;
      let matchPeriod = period === 'ALL';
      if (!matchPeriod && t.transactionDate) {
        // Date format is YYYY-MM-DD
        const parts = t.transactionDate.split('-');
        if (parts.length === 3) {
          matchPeriod = `${parts[0]}-${parts[1]}` === period;
        }
      }
      return matchBank && matchPeriod;
    });
  });

  readonly availablePeriods = computed(() => {
    const periods = new Set<string>();
    for (const t of this.allTx()) {
      if (!t.transactionDate) continue;
      const parts = t.transactionDate.split('-');
      if (parts.length === 3) {
        periods.add(`${parts[0]}-${parts[1]}`);
      }
    }
    return Array.from(periods).sort().reverse();
  });

  // For summary cards
  readonly totalExpense = computed(() =>
    this.globalFilteredTx().filter(t => t.transactionType === 'EXPENSE').reduce((s, t) => s + t.amount, 0)
  );

  readonly totalIncome = computed(() =>
    this.globalFilteredTx().filter(t => t.transactionType === 'INCOME').reduce((s, t) => s + t.amount, 0)
  );

  readonly subscriptionCount = computed(() =>
    this.globalFilteredTx().filter(t => t.isMonthlySubscription === 1).length
  );

  readonly statementCount = computed(() =>
    this.statementsResource.value()?.statements.length ?? 0
  );

  // For charts
  readonly byMonth = computed(() => {
    const buckets = new Array(12).fill(0);
    for (const t of this.globalFilteredTx()) {
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
    for (const t of this.globalFilteredTx()) {
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

  // Unique categories for dropdown
  readonly availableCategories = computed(() => {
    const cats = new Set<string>();
    for (const t of this.globalFilteredTx()) {
      cats.add(t.category ?? 'Diğer');
    }
    return [...cats].sort();
  });

  // ---- Transaction Table (all filters applied + paginated) ----
  readonly tableTransactions = computed<Transaction[]>(() => {
    let txs = this.globalFilteredTx();
    const cat = this.filterCategory();
    const month = this.filterMonth();
    const type = this.filterType();
    const search = this.filterSearch().toLowerCase().trim();

    if (cat) {
      txs = txs.filter(t => (t.category ?? 'Diğer') === cat);
    }
    if (month) {
      const mi = parseInt(month);
      txs = txs.filter(t => {
        const d = new Date(t.transactionDate);
        return !isNaN(d.getTime()) && d.getMonth() === mi;
      });
    }
    if (type) {
      txs = txs.filter(t => t.transactionType === type);
    }
    if (search) {
      txs = txs.filter(t =>
        (t.cleanName ?? t.rawDescription).toLowerCase().includes(search) ||
        (t.category ?? '').toLowerCase().includes(search)
      );
    }

    return [...txs].sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
  });

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.tableTransactions().length / this.pageSize)));

  readonly paginatedTx = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.tableTransactions().slice(start, start + this.pageSize);
  });

  readonly pageNumbers = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    let start = Math.max(1, current - 2);
    let end = Math.min(total, start + 4);
    if (end - start < 4) {
      start = Math.max(1, end - 4);
    }
    const pages: number[] = [];
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  });

  readonly hasActiveFilters = computed(() =>
    !!(this.filterCategory() || this.filterMonth() || this.filterType() || this.filterSearch())
  );

  // ---- Modal State ----
  readonly modalOpen = signal(false);
  readonly modalTitle = signal('');
  readonly modalPage = signal(1);
  readonly modalPageSize = 10;
  readonly modalTransactions = signal<Transaction[]>([]);

  readonly modalTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.modalTransactions().length / this.modalPageSize))
  );

  readonly modalPaginatedTx = computed(() => {
    const start = (this.modalPage() - 1) * this.modalPageSize;
    return this.modalTransactions().slice(start, start + this.modalPageSize);
  });

  readonly modalPageNumbers = computed(() => {
    const total = this.modalTotalPages();
    const current = this.modalPage();
    let start = Math.max(1, current - 2);
    let end = Math.min(total, start + 4);
    if (end - start < 4) {
      start = Math.max(1, end - 4);
    }
    const pages: number[] = [];
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  });

  readonly modalTotal = computed(() =>
    this.modalTransactions().reduce((s, t) => s + t.amount, 0)
  );

  // ---- Chart Click → Open Modal ----
  onCategoryClick(category: string) {
    const txs = this.globalFilteredTx().filter(t => (t.category ?? 'Diğer') === category);
    this.openModal(`${category} — İşlem Detayları`, txs);
  }

  onMonthClick(monthIndex: number) {
    const monthName = TURKISH_MONTHS[monthIndex];
    const txs = this.globalFilteredTx().filter(t => {
      const d = new Date(t.transactionDate);
      return !isNaN(d.getTime()) && d.getMonth() === monthIndex;
    });
    this.openModal(`${monthName} — Harcamalar`, txs);
  }

  private openModal(title: string, txs: Transaction[]) {
    const sorted = [...txs].sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
    this.modalTitle.set(title);
    this.modalTransactions.set(sorted);
    this.modalPage.set(1);
    this.modalOpen.set(true);
  }

  closeModal() { this.modalOpen.set(false); }

  goToModalPage(page: number) {
    if (page >= 1 && page <= this.modalTotalPages()) this.modalPage.set(page);
  }

  // ---- Table actions ----
  onFilterChange() {
    this.currentPage.set(1);
  }

  clearAllFilters() {
    this.selectedBank.set('ALL');
    this.filterCategory.set('');
    this.filterMonth.set('');
    this.filterType.set('');
    this.filterSearch.set('');
    this.currentPage.set(1);
  }

  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages()) this.currentPage.set(page);
  }
}
