export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
}

export interface AuthResponse {
  tokenType: "Bearer";
  user: User;
}

export interface ApiError {
  message: string;
  status?: number;
}

