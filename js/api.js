// Calls to the app's own server functions with the person's sign-in attached.
export async function api(ctx, path, { method = 'GET', body = null, type = 'application/json', as = 'json' } = {}) {
  const token = ctx.store.token ? await ctx.store.token() : null;
  if (!token) throw new Error('Sign in to use this');
  const r = await fetch(path, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body != null ? { 'content-type': type } : {}) },
    body: body == null ? undefined : type === 'application/json' ? JSON.stringify(body) : body,
  });
  if (!r.ok) {
    let msg = 'Something went wrong. Try again.';
    try { msg = (await r.json()).error || msg; } catch { /* not JSON */ }
    throw new Error(msg);
  }
  return as === 'blob' ? r.blob() : r.json();
}
