import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Statement, Transaction } from '../../models/statement.model';

@Component({
  selector: 'app-statement-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, DatePipe, FormsModule],
  templateUrl: './statement-detail.component.html',
  styleUrl: './statement-detail.component.scss'
})
export class StatementDetailComponent {
  readonly id = input.required<string>();

  protected searchTerm = signal('');

  protected resource = httpResource<{ statement: Statement; transactions: Transaction[] }>(() =>
    `https://btk.squadturkiye.com/api/statements/${this.id()}`
  );

  protected data = computed(() => this.resource.value());

  protected filtered = computed<Transaction[]>(() => {
    const txs = this.data()?.transactions ?? [];
    const q = this.searchTerm().toLowerCase().trim();
    if (!q) return txs;
    return txs.filter(t =>
      (t.cleanName ?? '').toLowerCase().includes(q) ||
      t.rawDescription.toLowerCase().includes(q) ||
      (t.category ?? '').toLowerCase().includes(q)
    );
  });

  protected totalExpense = computed(() =>
    (this.data()?.transactions ?? [])
      .filter(t => t.transactionType === 'EXPENSE')
      .reduce((s, t) => s + t.amount, 0)
  );

  protected totalIncome = computed(() =>
    (this.data()?.transactions ?? [])
      .filter(t => t.transactionType === 'INCOME')
      .reduce((s, t) => s + t.amount, 0)
  );

  protected net = computed(() => this.totalIncome() - this.totalExpense());
}
