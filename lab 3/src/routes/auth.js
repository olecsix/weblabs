import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { parse } from '../utils/validation.js';
import { HttpError } from '../utils/errors.js';
import { hashPassword, publicUser, tokenHash, unauthorized, verifyPassword } from '../utils/security.js';

const email = z.email().trim().toLowerCase().max(254);
const password = z.string().min(8).max(128);
const credentials = z.strictObject({ email, password });
const registration = credentials.extend({ name: z.string().trim().min(2).max(100) });
const refresh = z.strictObject({ refreshToken: z.string().min(1).max(2048) });
const change = z.strictObject({ currentPassword: password, newPassword: password });

export function authRoutes(prisma, tokens, session, onSessionEnd) {
  const router = Router();
  const throttle = rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: () => { throw new HttpError(429, 'RATE_LIMIT', 'Забагато спроб. Спробуйте пізніше.'); } });
  const dummyHash = hashPassword('dummy-password-for-timing-only');
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  router.post('/register', throttle, async (req, res) => {
    const { name, email, password } = parse(registration, req.body);
    const passwordHash = await hashPassword(password);
    const data = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { name, email, passwordHash }, select: publicUser });
      return { user, tokens: await tokens.issue(tx, user.id) };
    });
    res.status(201).json(data);
  });

  router.post('/login', throttle, async (req, res) => {
    const input = parse(credentials, req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email }, select: { ...publicUser, passwordHash: true } });
    const valid = await verifyPassword(user?.passwordHash ?? await dummyHash, input.password);
    if (!user?.passwordHash || !valid) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Невірна адреса або пароль');
    const { passwordHash, ...profile } = user;
    const data = await prisma.$transaction(async (tx) => {
      // Compare-and-set prevents a login with an old password racing a password change.
      const claimed = await tx.user.updateMany({ where: { id: profile.id, passwordHash }, data: { passwordHash } });
      if (claimed.count !== 1) throw unauthorized();
      return tokens.issue(tx, profile.id);
    });
    res.json({ user: profile, tokens: data });
  });

  router.post('/refresh', throttle, async (req, res) => {
    const { refreshToken } = parse(refresh, req.body);
    const { sub, jti } = tokens.verify(refreshToken, 'refresh');
    const data = await prisma.$transaction(async (tx) => {
      const consumed = await tx.refreshToken.updateMany({
        where: { id: jti, userId: sub, tokenHash: tokenHash(refreshToken), revokedAt: null, expiresAt: { gt: new Date() } },
        data: { revokedAt: new Date() },
      });
      if (consumed.count !== 1) throw unauthorized();
      const user = await tx.user.findUniqueOrThrow({ where: { id: sub }, select: publicUser });
      return { user, tokens: await tokens.issue(tx, sub) };
    }, { isolationLevel: 'Serializable' });
    onSessionEnd({ sid: jti });
    res.json(data);
  });

  router.get('/me', session, (req, res) => res.json({ data: req.user }));
  router.post('/logout', session, async (req, res) => {
    await prisma.refreshToken.updateMany({ where: { id: req.session.sid, revokedAt: null }, data: { revokedAt: new Date() } });
    onSessionEnd({ sid: req.session.sid });
    res.status(204).end();
  });

  router.patch('/password', throttle, session, async (req, res) => {
    const { currentPassword, newPassword } = parse(change, req.body);
    const { passwordHash } = await prisma.user.findUniqueOrThrow({ where: { id: req.user.id }, select: { passwordHash: true } });
    if (!passwordHash || !(await verifyPassword(passwordHash, currentPassword))) throw new HttpError(400, 'INVALID_PASSWORD', 'Невірний поточний пароль');
    const nextHash = await hashPassword(newPassword);
    await prisma.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({ where: { id: req.user.id, passwordHash }, data: { passwordHash: nextHash } });
      if (changed.count !== 1) throw unauthorized();
      await tx.refreshToken.updateMany({ where: { userId: req.user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    }, { isolationLevel: 'Serializable' });
    onSessionEnd({ userId: req.user.id });
    res.status(204).end();
  });
  return router;
}
