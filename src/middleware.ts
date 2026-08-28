import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware((context, next) => {
  const { cookies, url } = context;
  
  // Skip auth during prerendering (context.locals.runtime is undefined during prerender)
  // This allows the index page to be prerendered with spreadsheet data
  if (typeof context.locals.runtime === 'undefined') {
    return next();
  }
  
  const authToken = cookies.get('auth_token')?.value;

  // Allow login page and API endpoint without auth
  if (url.pathname === '/login' || url.pathname.startsWith('/api/login')) {
    return next();
  }

  // Require auth token for all other routes at runtime
  if (!authToken || authToken !== 'authenticated') {
    return context.redirect('/login');
  }

  return next();
});
