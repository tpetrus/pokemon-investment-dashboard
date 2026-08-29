import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware((context, next) => {
  const { cookies, url } = context;
  
  const authToken = cookies.get('auth_token')?.value;

  // Allow login page and API endpoint without auth
  if (url.pathname === '/login' || url.pathname.startsWith('/api/login')) {
    return next();
  }

  // Require auth token for all other routes
  if (!authToken || authToken !== 'authenticated') {
    return context.redirect('/login');
  }

  return next();
});
