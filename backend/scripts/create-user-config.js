const { randomBytes, randomUUID, scryptSync } = require('node:crypto');
const readline = require('node:readline/promises');
const { StringDecoder } = require('node:string_decoder');

function promptHiddenPassword(prompt) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY || typeof input.setRawMode !== 'function') {
      reject(new Error('A senha deve ser digitada em um terminal interativo'));
      return;
    }

    const decoder = new StringDecoder('utf8');
    let password = '';
    let settled = false;

    function finish(error) {
      if (settled) {
        return;
      }
      settled = true;
      input.removeListener('data', handleInput);
      input.setRawMode(false);
      input.pause();
      process.stderr.write('\n');
      if (error) {
        reject(error);
      } else {
        resolve(password);
      }
    }

    function handleInput(chunk) {
      for (const character of decoder.write(chunk)) {
        if (character === '\u0003' || character === '\u0004') {
          finish(new Error('Leitura da senha cancelada'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          return;
        }
        if (character === '\u007f' || character === '\b') {
          password = Array.from(password).slice(0, -1).join('');
        } else {
          password += character;
        }
      }
    }

    process.stderr.write(prompt);
    input.setRawMode(true);
    input.resume();
    input.on('data', handleInput);
  });
}

async function main() {
  let username = process.argv[2];
  if (!username) {
    const prompts = readline.createInterface({ input: process.stdin, output: process.stderr });
    try {
      username = await prompts.question('Usuário: ');
    } finally {
      prompts.close();
    }
  }

  username = username.trim();
  const password = await promptHiddenPassword('Senha (entrada oculta): ');
  if (!username || !password || password.length > 1024) {
    throw new Error('Usuário e senha válidos são obrigatórios');
  }

  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64);
  const user = {
    id: randomUUID(),
    username,
    passwordHash: `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`,
  };
  process.stdout.write(`${JSON.stringify([user])}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});