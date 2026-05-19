import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { httpResource } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Statement } from '../../models/statement.model';

@Component({
  selector: 'app-statements-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink],
  templateUrl: './statements-list.component.html',
  styleUrl: './statements-list.component.scss'
})
export class StatementsListComponent {
  private http = inject(HttpClient);
  protected isRecategorizing = signal(false);
  protected recategorizeMessage = signal<string | null>(null);

  protected statements = httpResource<{ statements: Statement[] }>(() =>
    'https://btk.squadturkiye.com/api/statements'
  );

  recategorize() {
    this.isRecategorizing.set(true);
    this.recategorizeMessage.set(null);
    this.http.post<{message: string, updated: number}>('https://btk.squadturkiye.com/api/statements/recategorize', {})
      .subscribe({
        next: (res) => {
          this.isRecategorizing.set(false);
          this.recategorizeMessage.set(res.message);
          setTimeout(() => this.recategorizeMessage.set(null), 3000);
        },
        error: (err) => {
          this.isRecategorizing.set(false);
          this.recategorizeMessage.set('Kategorizasyon sırasında hata oluştu.');
          setTimeout(() => this.recategorizeMessage.set(null), 3000);
        }
      });
  }

  deleteStatement(id: number) {
    if (confirm('Bu ekstreyi ve tüm işlemlerini silmek istediğinize emin misiniz?')) {
      this.http.delete(`https://btk.squadturkiye.com/api/statements/${id}`)
        .subscribe({
          next: () => {
            this.statements.reload();
          },
          error: (err) => {
            alert('Ekstre silinirken bir hata oluştu.');
          }
        });
    }
  }
}
