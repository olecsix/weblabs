import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'node:crypto';
import { HttpError } from './errors.js';

export const publicUser = { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true };
export const hashPassword = (password) => argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
export const verifyPassword = (hash, password) => argon2.verify(hash, password);
export const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
export const unauthorized = () => new HttpError(401, 'UNAUTHORIZED', 'Потрібна дійсна сесія');
export const forbidden = () => new HttpError(403, 'FORBIDDEN', 'Недостатньо прав');

export function tokenService(config) {
  const issuer = 'task-manager';
  function verify(token, type) {
    try {
      return jwt.verify(token, type === 'access' ? config.JWT_SECRET : config.REFRESH_TOKEN_SECRET, {
        algorithms: ['HS256'], issuer, audience: type,
      });
    } catch {
      throw unauthorized();
    }
  }

  async function issue(db, userId) {
    const id = randomUUID();
    const refreshToken = jwt.sign({}, config.REFRESH_TOKEN_SECRET, {
      algorithm: 'HS256', issuer, audience: 'refresh', subject: userId, jwtid: id, expiresIn: '7d',
    });
    await db.refreshToken.create({ data: {
      id, userId, tokenHash: tokenHash(refreshToken), expiresAt: new Date(jwt.decode(refreshToken).exp * 1000),
    } });
    const accessToken = jwt.sign({ sid: id }, config.JWT_SECRET, {
      algorithm: 'HS256', issuer, audience: 'access', subject: userId, expiresIn: '15m',
    });
    return { accessToken, refreshToken };
  }

  async function authenticate(db, token) {
    const { sub, sid, exp } = verify(token, 'access');
    const session = await db.refreshToken.findFirst({
      where: { id: sid, userId: sub, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { user: { select: publicUser } },
    });
    if (!session) throw unauthorized();
    return { user: session.user, sid, expiresAt: exp * 1000 };
  }

  return { verify, issue, authenticate };
}

export function requireSession(prisma, tokens) {
  return async (req, res, next) => {
    const token = req.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) throw unauthorized();
    req.session = await tokens.authenticate(prisma, token);
    req.user = req.session.user;
    next();
  };
}

export function requireAdmin(req, res, next) {
  if (req.user.role !== 'ADMIN') throw forbidden();
  next();
}
