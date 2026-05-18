import { ChangeDetectionStrategy, Component } from '@angular/core';
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
  protected statements = httpResource<{ statements: Statement[] }>(() =>
    'http://localhost:3000/api/statements'
  );
}
