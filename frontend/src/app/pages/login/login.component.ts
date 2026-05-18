import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
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
