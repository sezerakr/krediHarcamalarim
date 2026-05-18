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
