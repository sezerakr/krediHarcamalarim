import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})
export class RegisterComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  protected name = '';
  protected email = '';
  protected password = '';
  protected loading = signal(false);
  protected errorMsg = signal<string | null>(null);

  submit() {
    this.loading.set(true);
    this.errorMsg.set(null);
    this.auth.register({ email: this.email, password: this.password, name: this.name }).subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: (err) => {
        this.errorMsg.set(err?.error?.error ?? 'Bir hata oluştu');
        this.loading.set(false);
      },
    });
  }
}
