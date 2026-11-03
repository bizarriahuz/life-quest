// Accounts: sign up (with email confirmation), sign in, sign out, resend, forgot / reset password.
// Sessions are an HttpOnly cookie. Passwords: PBKDF2 (bcrypt hashes carried over from Supabase still work and are upgraded).
import {
  handler, fail, json, sha256, randomToken, hashPassword, verifyPassword, newSession, currentUser,
  sessionCookie, limit, now, clientIp,
} from '../_lib/util.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanEmail = (e) => String(e || '').trim().toLowerCase();

async function human(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true; // bot check not set up (local / preview)
  if (!token) return false;
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }),
  }).then((x) => x.json()).catch(() => ({ success: false }));
  return !!r.success;
}

// Send an email through Resend. Without a key (local tests) the message is kept in env.__outbox.
export async function sendMail(env, to, subject, html, text) {
  if (!env.RESEND_API_KEY) { (env.__outbox ||= []).push({ to, subject, html, text }); return true; }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM || 'Life Quest <onboarding@resend.dev>', to: [to], subject, html, text }),
  });
  if (!r.ok) { console.error('email failed', r.status, await r.text()); return false; }
  return true;
}

async function emailLink(env, db, origin, user, kind) {
  const token = randomToken();
  await db.batch([
    db.prepare('delete from email_tokens where user_id = ? and kind = ?').bind(user.id, kind),
    db.prepare('insert into email_tokens(token_hash, user_id, kind, expires_at) values (?, ?, ?, ?)')
      .bind(await sha256(token), user.id, kind, new Date(Date.now() + (kind === 'confirm' ? 72 : 1) * 3600e3).toISOString()),
  ]);
  const link = `${origin}/#${kind}=${token}`;
  if (env.DEV_MAIL === '1') { (env.__links ||= []).push(link); return link; } // local tests only
  const btn = (label) => `<p style="margin:24px 0"><a href="${link}" style="background:#111;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">${label}</a></p>`;
  const foot = '<p style="color:#888;font-size:13px">If you didn’t ask for this, you can ignore this email.</p>';
  if (kind === 'confirm') {
    return sendMail(env, user.email, 'Confirm your Life Quest account',
      `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#111"><h2>Welcome to Life Quest</h2><p>Tap below to confirm your email and start using your account.</p>${btn('Confirm my email')}<p style="color:#888;font-size:13px">The link works for 3 days.</p>${foot}</div>`,
      `Welcome to Life Quest. Confirm your email: ${link}`);
  }
  return sendMail(env, user.email, 'Reset your Life Quest password',
    `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#111"><h2>Reset your password</h2><p>Tap below to choose a new password.</p>${btn('Choose a new password')}<p style="color:#888;font-size:13px">The link works for 1 hour and only once.</p>${foot}</div>`,
    `Reset your Life Quest password: ${link}`);
}

async function useToken(db, token, kind) {
  const h = await sha256(String(token || ''));
  const row = await db.prepare('select * from email_tokens where token_hash = ? and kind = ?').bind(h, kind).first();
  if (!row || Date.parse(row.expires_at) < Date.now()) fail(kind === 'confirm'
    ? 'That confirmation link has expired or was already used. Sign in to get a new one.'
    : 'That reset link has expired or was already used. Ask for a new one.', 400);
  await db.prepare('delete from email_tokens where token_hash = ?').bind(h).run();
  return row;
}

const signedIn = async (db, req, user, extra = {}) => {
  const token = await newSession(db, user.id);
  return json({ user: { id: user.id, email: user.email }, ...extra }, 200, { 'set-cookie': sessionCookie(token, req) });
};

export const onRequest = handler(async ({ request: req, env, body, db }) => {
  const origin = new URL(req.url).origin;
  const ip = clientIp(req);
  const action = body.action;

  if (action === 'session') {
    const u = await currentUser(db, req);
    return { user: u && { id: u.id, email: u.email } };
  }

  if (action === 'signout') {
    const u = await currentUser(db, req);
    if (u) await db.prepare('delete from sessions where token_hash = ?').bind(u.token_hash).run();
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(null, req) });
  }

  if (action === 'signin') {
    const email = cleanEmail(body.email), pw = String(body.password || '');
    await limit(db, `signin:${ip}`, 30, 15);
    await limit(db, `signin:${email}`, 10, 15, 'Too many tries for this account. Please wait 15 minutes.');
    if (!(await human(env, body.captchaToken, ip))) fail('Please complete the security check, then try again.', 403);
    const user = await db.prepare('select * from users where email = ?').bind(email).first();
    const check = await verifyPassword(pw, user?.password_hash);
    if (!user || !check.ok) fail('Wrong email or password. New here? Tap “Create account” instead.', 400);
    if (!user.email_confirmed_at) return json({ error: 'Email not confirmed', code: 'unconfirmed' }, 403);
    const upd = [db.prepare('update users set last_sign_in_at = ? where id = ?').bind(now(), user.id)];
    if (check.legacy) upd.push(db.prepare('update users set password_hash = ? where id = ?').bind(await hashPassword(pw), user.id));
    await db.batch(upd);
    return signedIn(db, req, user);
  }

  if (action === 'signup') {
    const email = cleanEmail(body.email), pw = String(body.password || '');
    if (!EMAIL.test(email) || email.length > 254) fail('That email doesn’t look right.');
    if (pw.length < 8 || pw.length > 200) fail('Choose a password of at least 8 characters.');
    await limit(db, `signup:${ip}`, 5, 60, 'Too many sign-ups right now. Please try again in an hour.');
    if (!(await human(env, body.captchaToken, ip))) fail('Please complete the security check, then try again.', 403);
    const exists = await db.prepare('select id from users where email = ?').bind(email).first();
    if (exists) return json({ error: 'That email already has an account. Sign in instead.', code: 'exists' }, 409);
    const user = { id: crypto.randomUUID(), email };
    // No email service set up (local tests / preview): accounts are confirmed straight away.
    const autoConfirm = !env.RESEND_API_KEY && env.AUTO_CONFIRM === '1';
    await db.prepare('insert into users(id, email, password_hash, email_confirmed_at) values (?, ?, ?, ?)')
      .bind(user.id, email, await hashPassword(pw), autoConfirm ? now() : null).run();
    if (autoConfirm) return signedIn(db, req, user);
    const sent = await emailLink(env, db, origin, user, 'confirm');
    return { ok: true, confirm: true, ...(env.DEV_MAIL === '1' ? { dev_link: sent } : {}) };
  }

  if (action === 'resend') {
    const email = cleanEmail(body.email);
    await limit(db, `mail:${email}`, 3, 60, 'Too many emails just now. Please try again in a little while.');
    if (!(await human(env, body.captchaToken, ip))) fail('Please complete the security check, then try again.', 403);
    const user = await db.prepare('select id, email, email_confirmed_at from users where email = ?').bind(email).first();
    const sent = user && !user.email_confirmed_at ? await emailLink(env, db, origin, user, 'confirm') : null;
    return { ok: true, ...(env.DEV_MAIL === '1' ? { dev_link: sent } : {}) };
  }

  if (action === 'confirm') {
    const row = await useToken(db, body.token, 'confirm');
    await db.prepare('update users set email_confirmed_at = coalesce(email_confirmed_at, ?), last_sign_in_at = ? where id = ?').bind(now(), now(), row.user_id).run();
    const user = await db.prepare('select id, email from users where id = ?').bind(row.user_id).first();
    return signedIn(db, req, user);
  }

  if (action === 'forgot') {
    const email = cleanEmail(body.email);
    await limit(db, `forgot:${ip}`, 10, 60);
    await limit(db, `mail:${email}`, 3, 60, 'Too many emails just now. Please try again in a little while.');
    if (!(await human(env, body.captchaToken, ip))) fail('Please complete the security check, then try again.', 403);
    const user = await db.prepare('select id, email from users where email = ?').bind(email).first();
    const sent = user ? await emailLink(env, db, origin, user, 'reset') : null;
    return { ok: true, ...(env.DEV_MAIL === '1' ? { dev_link: sent } : {}) }; // same answer either way, so nobody can test which emails have accounts
  }

  if (action === 'reset') {
    const pw = String(body.password || '');
    if (pw.length < 8 || pw.length > 200) fail('Choose a password of at least 8 characters.');
    const row = await useToken(db, body.token, 'reset');
    // a reset signs out every other device and also confirms the email (they opened a link sent to it)
    await db.batch([
      db.prepare('update users set password_hash = ?, email_confirmed_at = coalesce(email_confirmed_at, ?), last_sign_in_at = ? where id = ?')
        .bind(await hashPassword(pw), now(), now(), row.user_id),
      db.prepare('delete from sessions where user_id = ?').bind(row.user_id),
    ]);
    const user = await db.prepare('select id, email from users where id = ?').bind(row.user_id).first();
    return signedIn(db, req, user);
  }

  fail('Unknown action', 404);
});
