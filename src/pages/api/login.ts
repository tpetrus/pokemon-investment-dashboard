export const prerender = false;

export async function POST({ request, cookies }: any) {
  const body = await request.json();
  const { password } = body;

  if (password === import.meta.env.APP_PASSWORD) {
    cookies.set('auth_token', 'authenticated', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24, // 24 hours
    });
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: false, error: 'Incorrect password' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
