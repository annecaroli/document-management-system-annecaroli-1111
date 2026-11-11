function createAuthMiddleware(authService) {
  return function requireAuthenticatedUser(req, res, next) {
    const authorization = req.get('authorization') || '';
    const match = /^Bearer ([A-Za-z0-9_-]+)$/.exec(authorization);
    const user = match ? authService.authenticate(match[1]) : null;

    if (!user) {
      return res.status(401).json({
        error: { code: 'UNAUTHENTICATED', message: 'Autenticação necessária' },
      });
    }

    req.user = user;
    req.authToken = match[1];
    return next();
  };
}

module.exports = createAuthMiddleware;