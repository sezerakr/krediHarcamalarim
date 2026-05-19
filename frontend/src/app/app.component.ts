import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from './core/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  auth = inject(AuthService);
  sidebarCollapsed = false;
  isDarkMode = signal(false);

  ngOnInit() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      this.setDarkTheme(true);
    }
  }

  toggleTheme() {
    this.setDarkTheme(!this.isDarkMode());
  }

  private setDarkTheme(isDark: boolean) {
    this.isDarkMode.set(isDark);
    if (isDark) {
      document.body.classList.add('dark-theme');
      document.documentElement.setAttribute('data-bs-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.body.classList.remove('dark-theme');
      document.documentElement.removeAttribute('data-bs-theme');
      localStorage.setItem('theme', 'light');
    }
  }
}
