import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home/home.component').then(m => m.HomeComponent) },
  { path: 'login', loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent) },
  { path: 'register', loadComponent: () => import('./pages/register/register.component').then(m => m.RegisterComponent) },
  { path: 'dashboard', canActivate: [authGuard], loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent) },
  { path: 'upload', canActivate: [authGuard], loadComponent: () => import('./pages/upload/upload.component').then(m => m.UploadComponent) },
  { path: 'statements', canActivate: [authGuard], loadComponent: () => import('./pages/statements/statements-list.component').then(m => m.StatementsListComponent) },
  { path: 'statements/:id', canActivate: [authGuard], loadComponent: () => import('./pages/statements/statement-detail.component').then(m => m.StatementDetailComponent) },
  { path: '**', redirectTo: 'dashboard' },
];
