---
name: my-custom
description: "Atualiza dependências npm no backend, frontend ou em ambos, validando compatibilidade e testes."
argument-hint: "escopo (backend, frontend ou ambos) e pacotes opcionais"
agent: agent
---

# Atualizar dependências

Atualize as dependências npm no escopo `${input:escopo:backend, frontend ou ambos}`. Pacotes específicos, se informados: `${input:pacotes:todos os pacotes diretos do escopo}`.

## Procedimento

1. Inspecione `package.json`, lockfiles e scripts do escopo solicitado. Preserve o gerenciador e a convenção de versões já usados em cada projeto; neste repositório, backend e frontend usam npm e versões exatas.
2. Execute `npm outdated` e `npm audit` em cada diretório selecionado para registrar versões disponíveis e a situação de segurança antes da mudança. Identifique mudanças de major, pacotes descontinuados e avisos relevantes. Atualize dependências diretas apenas dentro do escopo escolhido; mantenha prereleases fora da atualização, salvo pedido explícito.
3. Atualize patch e minor automaticamente. Não faça upgrades major sem autorização explícita. Se um major for necessário para corrigir uma vulnerabilidade ou incompatibilidade, explique o motivo e pare antes de aplicar esse upgrade.
4. Atualize `package.json` e o lockfile correspondente com npm. Não edite lockfiles manualmente, não remova dependências sem justificativa e não use `npm audit fix --force`.
5. Revise as notas de versão e alterações incompatíveis das dependências atualizadas. Ajuste somente o código e a configuração afetados, mantendo as convenções do projeto.
6. Execute novamente `npm audit` e compare com o resultado inicial. Depois rode as verificações disponíveis no escopo alterado: `npm test` no backend e `npm run build` no frontend. Rode também lint ou outros checks apenas se estiverem configurados. Se uma verificação falhar, corrija problemas introduzidos pela atualização e repita o check; não mascare falhas preexistentes.
7. Revise o diff e o estado do Git. Não inclua arquivos não relacionados, arquivos de ambiente, credenciais, artefatos de build ou mudanças do usuário fora do escopo. Não faça commit nem push, a menos que o usuário peça explicitamente.

## Resultado

Resuma cada pacote alterado com versão anterior e nova, os arquivos modificados, verificações executadas e seus resultados, vulnerabilidades restantes e upgrades major que ficaram pendentes de autorização. Se não houver atualização segura disponível, não force mudanças e explique o bloqueio.
