import 'reflect-metadata';

try {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile('.env');
  }
} catch {
  try {
    if (typeof process.loadEnvFile === 'function') {
      process.loadEnvFile('../../.env');
    }
  } catch {}
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:24790141@localhost:5432/acasoft-restaurant-saas?schema=public';
}
if (!process.env.JWT_ACCESS_SECRET) {
  process.env.JWT_ACCESS_SECRET = 'acasoft_restaurant_saas_jwt_access_secret_super_secure_key_2026_x';
}
if (!process.env.JWT_REFRESH_SECRET) {
  process.env.JWT_REFRESH_SECRET = 'acasoft_restaurant_saas_jwt_refresh_secret_super_secure_key_2026_x';
}
if (!process.env.COOKIE_SECRET) {
  process.env.COOKIE_SECRET = 'acasoft_restaurant_saas_cookie_secret_super_secure_key_2026_x';
}
