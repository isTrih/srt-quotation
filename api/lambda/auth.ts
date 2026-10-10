import { useHonoContext } from '@modern-js/server-runtime';
import { query } from '../_lib/db.js';
import { session, sameOrigin, body, setup, throttle, matchesPassword, setSession, logout, fail, HttpError } from '../_lib/auth.js';
export async function get() {
  const c = useHonoContext();
  c.header('Cache-Control', 'no-store');
  return { setupRequired: !query('SELECT id FROM admin WHERE id=1').get(), authenticated: Boolean(session(c)) };
}
export async function post() {
  const c = useHonoContext();
  try {
    sameOrigin(c);
    const { action, username, password } = await body(c);
    if (action === 'logout') { logout(c); return { ok:true }; }
    throttle(c);
    if (action === 'setup') await setup(username, password);
    else if (action === 'login') {
      const admin = query('SELECT * FROM admin WHERE id=1').get();
      if (!admin || typeof password !== 'string' || !await matchesPassword(password, admin.password) || username !== admin.username) throw new HttpError(401,'账号或密码不正确');
    } else throw new HttpError(400,'操作无效');
    setSession(c);
    return { ok:true };
  } catch (error) { return fail(c,error); }
}
