import { createRemoteJWKSet, jwtVerify } from 'jose';

const keys = new Map();
export async function identity(request, env) {
  const host = new URL(request.url).hostname;
  if (['localhost', '127.0.0.1', '[::1]'].includes(host) && env.LOCAL_DEV === '1')
    return { authenticated: false, email: null };
  const domain = env.ACCESS_TEAM_DOMAIN || '';
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain) || !env.ACCESS_AUD) return null;
  const issuer = `https://${domain}`;
  if (!keys.has(domain)) keys.set(domain, createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)));
  try {
    const { payload } = await jwtVerify(request.headers.get('Cf-Access-Jwt-Assertion') || '', keys.get(domain), {
      issuer, audience: env.ACCESS_AUD, algorithms: ['RS256'], requiredClaims: ['exp', 'email']
    });
    return { authenticated: true, email: payload.email };
  } catch { return null; }
}
