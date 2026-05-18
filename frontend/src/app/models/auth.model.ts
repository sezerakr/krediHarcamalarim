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
