function createAuthController(authService) {
  return {
    async login(req, res) {
      const { username, password } = req.body || {};
      if (
        typeof username !== 'string'
        || typeof password !== 'string'
        || username.length > 128
        || password.length > 1024
      ) {
        return res.status(400).json({
          error: { code: 'INVALID_CREDENTIALS', message: 'Informe usuário e senha' },
        });
      }

      const session = await authService.login(username, password);
      if (!session) {
        req.recordLoginFailure?.();
        return res.status(401).json({
          error: { code: 'INVALID_CREDENTIALS', message: 'Usuário ou senha inválidos' },
        });
      }

      req.clearLoginFailures?.();
      return res.json(session);
    },

    logout(req, res) {
      authService.logout(req.authToken);
      return res.status(204).end();
    },
  };
}

module.exports = createAuthController;