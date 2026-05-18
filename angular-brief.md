# Angular Frontend — Developer Brief (2026 Edition)

## Project Context
We're building a **personal finance dashboard** called "Kredi Harcamalarım" for a BTK Hackathon. The backend is already complete and running at `http://localhost:3000`. Your job is to build the Angular frontend that connects to it.

## Tech Stack
- **Angular 21 LTS** (Angular 22 dropped May 2026 but ecosystem libs lag — pin to 21 for the hackathon)
- **Standalone components** (only mode in v21)
- **Zoneless change detection** (default for new v21 projects)
- **Angular Router** with **functional guards**
- **Signals** for all UI state (no `BehaviorSubject` for component state)
- **`httpResource()` / `resource()`** for server data (Angular 19+, stable)
- **SCSS** for styling
- **chart.js v4** directly (skip `ng2-charts` — version-lag risk for a hackathon)
- **SSR disabled** (pure SPA)

## Setup
```bash
npx -y @angular/cli@21 new frontend --routing --style=scss --ssr=false --skip-git --zoneless
cd frontend
npm install chart.js
ng serve
```

Frontend runs on `http://localhost:4200`, backend on `http://localhost:3000`.
CORS is already configured on the backend to accept requests from `localhost:4200`.

---

## Modern Angular Conventions (MUST FOLLOW)

These are non-negotiable for this codebase. The generator should never emit the legacy form when a modern equivalent exists.

| Use this | Not this |
|---|---|
| `inject(Service)` | `constructor(private s: Service)` |
| `signal()`, `computed()`, `effect()` | `BehaviorSubject` for UI state |
| `input()`, `input.required()`, `output()`, `model()` | `@Input()` / `@Output()` decorators |
| `@if` / `@for (... ; track x.id)` / `@switch` / `@empty` | `*ngIf` / `*ngFor` / `ngSwitch` |
| `httpResource(() => url)` / `resource()` | Manual `.subscribe()` + `BehaviorSubject` |
| Functional `CanActivateFn` | Class-based `CanActivate` |
| Functional `HttpInterceptorFn` | Class-based `HttpInterceptor` |
| `toSignal(observable$)` at component boundary | `async` pipe everywhere |
| `provideHttpClient(withFetch(), withInterceptors([...]))` | Module-based `HttpClientModule` |
| Standalone components, `imports: [...]` array | `NgModule` |
| `ChangeDetectionStrategy.OnPush` on every component | Default change detection |

Templates only: bind to signals by calling them — `{{ count() }}`, `[disabled]="loading()"`, `@if (user())`.

---

## API Reference (Backend: `http://localhost:3000`)

### Authentication

#### `POST /api/auth/register`
```json
// Request Body
{ "email": "user@example.com", "password": "123456", "name": "Ali Yılmaz" }

// Response 201
{
  "message": "Kayıt başarılı",
  "token": "eyJhbGci...",
  "user": { "id": 1, "email": "user@example.com", "name": "Ali Yılmaz" }
}

// Response 409 (duplicate email)
{ "error": "Bu email adresi zaten kayıtlı" }

// Response 400 (validation)
{ "error": "Doğrulama hatası", "details": { "email": ["Geçerli bir email adresi giriniz"] } }
```

#### `POST /api/auth/login`
```json
// Request Body
{ "email": "user@example.com", "password": "123456" }

// Response 200
{
  "message": "Giriş başarılı",
  "token": "eyJhbGci...",
  "user": { "id": 1, "email": "user@example.com", "name": "Ali Yılmaz" }
}

// Response 401
{ "error": "Email veya şifre hatalı" }
```

#### `GET /api/auth/me` 🔒
```
Headers: { Authorization: "Bearer <token>" }

// Response 200
{ "user": { "id": 1, "email": "user@example.com", "name": "Ali Yılmaz", "createdAt": "2026-05-15 20:37:27" } }
```

---

### Statements (All require `Authorization: Bearer <token>` header)

#### `POST /api/statements/upload` 🔒
```
Content-Type: multipart/form-data

Form Fields:
  - file: (PDF or XLSX/CSV file)
  - bankName: "ZİRAAT" or "PARAF"

// Response 201
{
  "message": "Ekstre başarıyla işlendi",
  "statementId": 1,
  "transactionCount": 45,
  "summary": { "totalExpense": 12500.50, "totalIncome": 3000.00, "subscriptions": 5 }
}

// Response 400
{ "error": "Desteklenmeyen dosya formatı. PDF, XLSX veya CSV yükleyin" }
```

#### `GET /api/statements` 🔒
```json
{
  "statements": [
    {
      "id": 1,
      "userId": 1,
      "fileName": "ziraat_ocak.pdf",
      "bankName": "ZİRAAT",
      "fileType": "PDF",
      "statementPeriod": null,
      "uploadedAt": "2026-05-15 21:00:00",
      "status": "processed",
      "errorMessage": null
    }
  ]
}
```

#### `GET /api/statements/:id` 🔒
```json
{
  "statement": { /* same shape as above */ },
  "transactions": [
    {
      "id": 1,
      "statementId": 1,
      "userId": 1,
      "bankName": "ZİRAAT",
      "transactionDate": "2026-01-15",
      "rawDescription": "MIGROS SANAL MARKET",
      "cleanName": "Migros",
      "amount": 450.75,
      "currency": "TRY",
      "transactionType": "EXPENSE",
      "isMonthlySubscription": 0,
      "installmentCurrent": null,
      "installmentTotal": null,
      "installmentAmount": null,
      "category": "Market",
      "createdAt": "2026-05-15 21:00:05"
    }
  ]
}
```

#### `POST /api/statements/preview` 🔒
Same as upload but returns parsed data without saving. Useful for debugging.

---

## TypeScript Models

```typescript
// src/app/models/bank.model.ts
// Use a const object — avoids fragile string-literal types with the dotted İ character
export const BANKS = {
  ZIRAAT: 'ZİRAAT',
  PARAF: 'PARAF',
} as const;
export type BankName = typeof BANKS[keyof typeof BANKS];
export type BankFilter = BankName | 'ALL';

// src/app/models/auth.model.ts
export interface User {
  id: number;
  email: string;
  name: string;
  createdAt?: string;
}

export interface AuthResponse {
  message: string;
  token: string;
  user: User;
}

// src/app/models/statement.model.ts
export interface Statement {
  id: number;
  userId: number;
  fileName: string;
  bankName: BankName;
  fileType: 'PDF' | 'XLSX' | 'CSV';
  statementPeriod: string | null;
  uploadedAt: string;
  status: 'pending' | 'processing' | 'processed' | 'failed';
  errorMessage: string | null;
}

export interface Transaction {
  id: number;
  statementId: number;
  userId: number;
  bankName: BankName;
  transactionDate: string;       // "YYYY-MM-DD"
  rawDescription: string;
  cleanName: string | null;
  amount: number;
  currency: 'TRY' | 'USD';
  transactionType: 'EXPENSE' | 'INCOME';
  isMonthlySubscription: 0 | 1;
  installmentCurrent: number | null;
  installmentTotal: number | null;
  installmentAmount: number | null;
  category: string | null;
  createdAt: string;
}

export interface UploadSummary {
  message: string;
  statementId: number;
  transactionCount: number;
  summary: {
    totalExpense: number;
    totalIncome: number;
    subscriptions: number;
  };
}
```

---

## Pages & Routing

| Route | Component | Description |
|-------|-----------|-------------|
| `/login` | `LoginComponent` | Email + password form |
| `/register` | `RegisterComponent` | Email + password + name form |
| `/dashboard` | `DashboardComponent` 🔒 | Overview charts, summary cards |
| `/upload` | `UploadComponent` 🔒 | Drag & drop file upload |
| `/statements` | `StatementsListComponent` 🔒 | Table of uploaded statements |
| `/statements/:id` | `StatementDetailComponent` 🔒 | Transactions for one statement |

🔒 = guarded by functional `authGuard`. Routes 🔒 use `loadComponent: () => import(...)` for code splitting.

---

## App Configuration

```typescript
// src/app/app.config.ts
import { ApplicationConfig, provideZonelessChangeDetection, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(
      withFetch(),
      withInterceptors([authInterceptor])
    ),
  ],
};
```

```typescript
// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'login', loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent) },
  { path: 'register', loadComponent: () => import('./pages/register/register.component').then(m => m.RegisterComponent) },
  { path: 'dashboard', canActivate: [authGuard], loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent) },
  { path: 'upload', canActivate: [authGuard], loadComponent: () => import('./pages/upload/upload.component').then(m => m.UploadComponent) },
  { path: 'statements', canActivate: [authGuard], loadComponent: () => import('./pages/statements/statements-list.component').then(m => m.StatementsListComponent) },
  { path: 'statements/:id', canActivate: [authGuard], loadComponent: () => import('./pages/statements/statement-detail.component').then(m => m.StatementDetailComponent) },
  { path: '**', redirectTo: 'dashboard' },
];
```

---

## Core Services

### AuthService — `inject()` + signals

```typescript
// src/app/core/auth.service.ts
import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { AuthResponse, User } from '../models/auth.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private readonly apiUrl = 'http://localhost:3000/api';

  // Reactive auth state — bind to it anywhere via currentUser() / isLoggedIn()
  readonly currentUser = signal<User | null>(this.readUser());
  readonly isLoggedIn = computed(() => this.currentUser() !== null);

  register(body: { email: string; password: string; name: string }) {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/register`, body).pipe(
      tap(res => this.persist(res))
    );
  }

  login(body: { email: string; password: string }) {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/login`, body).pipe(
      tap(res => this.persist(res))
    );
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  private persist(res: AuthResponse): void {
    localStorage.setItem('token', res.token);
    localStorage.setItem('user', JSON.stringify(res.user));
    this.currentUser.set(res.user);
  }

  private readUser(): User | null {
    const raw = localStorage.getItem('user');
    try {
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  }
}
```

### Functional Auth Guard

```typescript
// src/app/core/auth.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isLoggedIn() ? true : router.createUrlTree(['/login']);
};
```

### Functional HTTP Interceptor

```typescript
// src/app/core/auth.interceptor.ts
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.getToken();

  const authed = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authed).pipe(
    catchError(err => {
      if (err.status === 401) {
        auth.logout();
        router.navigate(['/login']);
      }
      return throwError(() => err);
    })
  );
};
```

---

## Data Fetching with `httpResource()`

`httpResource()` is the recommended way to fetch in Angular 21. It returns a signal-based resource with `.value()`, `.isLoading()`, `.error()`, `.reload()`, and auto-refetches when its URL function's signals change. No manual subscriptions, no `BehaviorSubject`.

### Statements list page

```typescript
// src/app/pages/statements/statements-list.component.ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Statement } from '../../models/statement.model';

@Component({
  selector: 'app-statements-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink],
  template: `
    <h1>Ekstrelerim</h1>

    @if (statements.isLoading()) {
      <p>Yükleniyor…</p>
    } @else if (statements.error()) {
      <p class="error">Hata: ekstreler yüklenemedi.</p>
    } @else {
      <table class="data-table">
        <thead>
          <tr>
            <th>Dosya Adı</th><th>Banka</th><th>Tarih</th><th>Durum</th>
          </tr>
        </thead>
        <tbody>
          @for (s of statements.value()?.statements ?? []; track s.id) {
            <tr [routerLink]="['/statements', s.id]">
              <td>{{ s.fileName }}</td>
              <td>{{ s.bankName }}</td>
              <td>{{ s.uploadedAt | date:'short' }}</td>
              <td>
                @switch (s.status) {
                  @case ('processed') { ✅ İşlendi }
                  @case ('processing') { ⏳ İşleniyor }
                  @case ('pending') { ⏳ Bekliyor }
                  @case ('failed') { ❌ Hata }
                }
              </td>
            </tr>
          } @empty {
            <tr><td colspan="4">Henüz ekstre yüklenmedi.</td></tr>
          }
        </tbody>
      </table>
    }
  `,
})
export class StatementsListComponent {
  protected statements = httpResource<{ statements: Statement[] }>(() =>
    'http://localhost:3000/api/statements'
  );
}
```

### Statement detail — route param drives the resource

```typescript
// src/app/pages/statements/statement-detail.component.ts
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Statement, Transaction } from '../../models/statement.model';

@Component({
  selector: 'app-statement-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, DatePipe, FormsModule],
  template: `
    @if (resource.isLoading()) {
      <p>Yükleniyor…</p>
    } @else if (data(); as d) {
      <header>
        <h1>{{ d.statement.fileName }}</h1>
        <p>{{ d.statement.bankName }} — {{ d.statement.uploadedAt | date:'short' }}</p>
      </header>

      <input type="text" [(ngModel)]="searchTerm" placeholder="İşlem ara..." />

      <table>
        @for (tx of filtered(); track tx.id) {
          <tr [class.expense]="tx.transactionType === 'EXPENSE'"
              [class.income]="tx.transactionType === 'INCOME'">
            <td>{{ tx.transactionDate | date:'shortDate' }}</td>
            <td>
              {{ tx.cleanName ?? tx.rawDescription }}
              @if (tx.isMonthlySubscription === 1) { <span title="Aylık abonelik">🔄</span> }
            </td>
            <td>{{ tx.amount | currency:tx.currency:'symbol':'1.2-2' }}</td>
            <td>{{ tx.category ?? 'Diğer' }}</td>
          </tr>
        } @empty {
          <tr><td colspan="4">Sonuç bulunamadı.</td></tr>
        }
      </table>

      <footer class="totals">
        <span>Gider: {{ totalExpense() | currency:'TRY' }}</span>
        <span>Gelir: {{ totalIncome() | currency:'TRY' }}</span>
        <span>Net: {{ net() | currency:'TRY' }}</span>
      </footer>
    }
  `,
})
export class StatementDetailComponent {
  // Signal input — bound automatically by withComponentInputBinding()
  readonly id = input.required<string>();

  protected searchTerm = signal('');

  protected resource = httpResource<{ statement: Statement; transactions: Transaction[] }>(() =>
    `http://localhost:3000/api/statements/${this.id()}`
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
```

### Dashboard — bank filter as a signal, all derivations as `computed()`

```typescript
// src/app/pages/dashboard/dashboard.component.ts (sketch)
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { BankFilter, Statement, Transaction } from '../../models/statement.model';

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [/* MonthlyChartComponent, CategoryChartComponent, SummaryCardComponent */],
  template: `
    <section class="filters">
      <label>Banka:</label>
      <select [value]="selectedBank()" (change)="onBankChange($event)">
        <option value="ALL">Tümü</option>
        <option value="ZİRAAT">Ziraat</option>
        <option value="PARAF">Paraf</option>
      </select>
    </section>

    <section class="cards">
      <app-summary-card label="Toplam Harcama" [value]="totalExpense()" />
      <app-summary-card label="Toplam Gelir" [value]="totalIncome()" />
      <app-summary-card label="Aylık Abonelik" [value]="subscriptionCount()" />
      <app-summary-card label="Ekstre Sayısı" [value]="statementCount()" />
    </section>

    <section class="charts">
      <app-monthly-chart [data]="byMonth()" />
      <app-category-chart [data]="byCategory()" />
    </section>
  `,
})
export class DashboardComponent {
  private http = inject(HttpClient);

  readonly selectedBank = signal<BankFilter>('ALL');

  protected onBankChange(e: Event) {
    this.selectedBank.set((e.target as HTMLSelectElement).value as BankFilter);
  }

  // Fetch every statement once on init
  private statementsResource = httpResource<{ statements: Statement[] }>(() =>
    'http://localhost:3000/api/statements'
  );

  // …then fan-out to load each statement's transactions.
  // For a hackathon, ask the backend for an aggregated /api/transactions endpoint
  // instead of N round-trips. Below assumes that endpoint exists:
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

  // [{ label: 'Ocak', total: 1234.5 }, ...]
  readonly byMonth = computed(() => {
    const buckets = new Array(12).fill(0);
    for (const t of this.filteredTx()) {
      if (t.transactionType !== 'EXPENSE') continue;
      const m = new Date(t.transactionDate).getMonth();
      buckets[m] += t.amount;
    }
    return TURKISH_MONTHS.map((label, i) => ({ label, total: buckets[i] }));
  });

  // [{ label: 'Market', total: 1234.5, color: '#4CAF50' }, ...]
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
```

---

## Chart Component Pattern (chart.js + signals + `effect`)

Wrap chart.js in a tiny standalone component. `effect()` redraws when the input signal changes. No `ng2-charts` dependency.

```typescript
// src/app/components/category-chart.component.ts
import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, effect, input, viewChild } from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

Chart.register(...registerables);

interface Slice { label: string; total: number; color: string; }

@Component({
  selector: 'app-category-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #canvas></canvas>`,
  styles: `:host { display: block; height: 320px; }`,
})
export class CategoryChartComponent implements AfterViewInit, OnDestroy {
  readonly data = input.required<Slice[]>();
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
```

Apply the same pattern for a `MonthlyChartComponent` (type: `'bar'`).

---

## Login Form Example (template-driven with signals)

```typescript
// src/app/pages/login/login.component.ts
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink],
  template: `
    <form (ngSubmit)="submit()" #f="ngForm">
      <h1>Giriş Yap</h1>

      @if (errorMsg(); as e) { <p class="error">{{ e }}</p> }

      <label>
        Email
        <input type="email" name="email" [(ngModel)]="email" required />
      </label>
      <label>
        Şifre
        <input type="password" name="password" [(ngModel)]="password" required />
      </label>

      <button type="submit" [disabled]="loading() || !f.form.valid">
        {{ loading() ? 'Giriş yapılıyor…' : 'Giriş Yap' }}
      </button>

      <a routerLink="/register">Hesabınız yok mu? Kayıt olun</a>
    </form>
  `,
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  protected email = '';
  protected password = '';
  protected loading = signal(false);
  protected errorMsg = signal<string | null>(null);

  submit() {
    this.loading.set(true);
    this.errorMsg.set(null);
    this.auth.login({ email: this.email, password: this.password }).subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: (err) => {
        this.errorMsg.set(err?.error?.error ?? 'Bir hata oluştu');
        this.loading.set(false);
      },
    });
  }
}
```

> Register is structurally identical, with an extra `name` field and a call to `auth.register()`.

---

## UI Requirements (functional spec)

### Dashboard
- **Summary cards**: Toplam Harcama, Toplam Gelir, Aylık Abonelikler, Yüklenen Ekstre Sayısı.
- **Monthly chart**: bar, x = Turkish month names, y = total expense.
- **Category chart**: doughnut with the colors below; show percentage + amount per slice.
- **Bank filter**: `select` bound to `selectedBank` signal — `'ALL' | 'ZİRAAT' | 'PARAF'`. All cards/charts derive via `computed()`.

### Upload
- Bank selector (radio or `<select>`).
- Drag-and-drop area + file picker. ZİRAAT accepts `.pdf`; PARAF accepts `.xlsx`/`.csv`.
- Progress indicator (use `HttpClient`'s `reportProgress: true, observe: 'events'`).
- Result summary after upload: transactionCount, totalExpense, totalIncome.
- Button to navigate to `/statements/:id`.

### Statements List
- Table: Dosya Adı, Banka, Tarih, Durum, İşlem Sayısı.
- Status badges via `@switch`: ✅ İşlendi / ⏳ İşleniyor / ❌ Hata.
- Row click → `/statements/:id`.

### Statement Detail
- Header: bank name, file name, upload date.
- Transaction table: Tarih, İşlem Adı (cleanName), Tutar, Kategori, Tür.
- Color rule: red for EXPENSE, green for INCOME. 🔄 icon if `isMonthlySubscription === 1`.
- Search via signal-driven `computed()` filter.
- Footer totals: expense, income, net.

---

## Categories & Colors

```typescript
export const CATEGORY_COLORS: Record<string, string> = {
  'Market':     '#4CAF50',
  'Yemek':      '#FF9800',
  'Ulaşım':    '#2196F3',
  'Eğlence':   '#9C27B0',
  'Giyim':      '#E91E63',
  'Sağlık':    '#00BCD4',
  'Eğitim':    '#3F51B5',
  'Fatura':     '#F44336',
  'Abonelik':   '#FF5722',
  'Transfer':   '#607D8B',
  'Teknoloji':  '#795548',
  'Diğer':     '#9E9E9E',
};

export const TURKISH_MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];
```

---

## Important Notes
- All API error messages are in **Turkish** — surface them via `err.error.error`.
- `isMonthlySubscription` is `0 | 1` (integer literal), not boolean. Compare with `=== 1`.
- Amounts are always **positive**; sign is decided by `transactionType`.
- Bank names contain the Turkish dotted İ — always use the `BANKS` const, never type the literal by hand.
- `category` may be `null` — fall back to `'Diğer'` for display and chart aggregation.
- `localStorage` for the JWT is acceptable for the hackathon. Note for the judges: in production, prefer HttpOnly cookies — current storage choice is XSS-exposed.

---

## Quick Sanity Checklist (before submitting)

- [ ] No `*ngIf` / `*ngFor` anywhere — all `@if` / `@for` with `track`.
- [ ] No `constructor(private x: …)` — only `inject()`.
- [ ] No `@Input()` / `@Output()` decorators — only `input()` / `output()` / `model()`.
- [ ] Every component has `changeDetection: ChangeDetectionStrategy.OnPush`.
- [ ] All component state is in `signal()`; derived values in `computed()`.
- [ ] All HTTP fetches use `httpResource()` or `resource()` (except the few RxJS `.subscribe()` cases for one-shot mutations like login).
- [ ] Guard and interceptor are functional, not classes.
- [ ] `provideZonelessChangeDetection()` is in `app.config.ts`.
- [ ] `BANKS` const is used everywhere instead of raw `'ZİRAAT'` / `'PARAF'` strings.
