# Especificação do Document Management System (DMS)

## 1. Objetivo

Entregar uma aplicação web para usuários autenticados enviarem, consultarem e baixarem seus próprios documentos, com arquivos armazenados localmente e metadados mantidos em memória.

## 2. Atores e pressupostos

- **Usuário:** autentica-se e gerencia apenas os documentos associados à sua identidade.
- **Operador:** configura as contas permitidas e os parâmetros da aplicação antes de iniciá-la.
- As contas são pré-configuradas pelo operador. Não há cadastro público, recuperação de senha ou administração de usuários pela interface.
- O serviço roda como uma única instância Node.js. Sessões e metadados não são compartilhados entre instâncias.
- A autenticação usa tokens bearer opacos mantidos em memória, com no máximo uma sessão ativa por usuário. Reiniciar o processo invalida todos os tokens.

## 3. Escopo

### Dentro do escopo do MVP

- Login e logout de usuários pré-configurados.
- Upload, listagem e download de documentos com isolamento por usuário.
- Interface React para autenticação e gestão dos documentos do usuário autenticado.
- Arquivos no filesystem local da aplicação; metadados em memória.
- Validação de formato e tamanho de upload, tratamento de erros e configuração por ambiente.

### Fora do escopo

- Cadastro público, recuperação de senha, papéis administrativos ou compartilhamento de documentos.
- Armazenamento em banco de dados, provedores externos ou nuvem.
- Versionamento, edição, pesquisa avançada, exclusão de documentos e auditoria persistente.
- Persistência de sessões e metadados entre reinícios ou suporte a múltiplas instâncias.

## 4. Requisitos funcionais

| ID | Requisito | Critério observável |
| --- | --- | --- |
| RF-01 | O sistema deve autenticar usuários configurados pelo operador. | Credenciais válidas iniciam uma sessão; inválidas não revelam se usuário ou senha falhou. |
| RF-02 | O sistema deve emitir e validar tokens bearer de sessão. | Rotas protegidas aceitam token válido; token ausente, inválido ou expirado recebe `401`. |
| RF-03 | O usuário pode encerrar sua sessão. | Após logout, o token deixa de autorizar requisições. |
| RF-04 | O usuário pode enviar um documento permitido. | Upload válido cria arquivo local e metadados associados ao usuário autenticado. |
| RF-05 | O usuário pode listar seus documentos. | A resposta contém somente documentos cujo dono é o usuário autenticado; lista vazia é válida. |
| RF-06 | O usuário pode baixar um documento próprio por identificador. | O arquivo é retornado como anexo com nome original seguro. Documento inexistente ou de outro usuário não é revelado e resulta em `404`. |
| RF-07 | A interface deve apresentar autenticação e gestão de documentos. | É possível entrar, enviar arquivo, consultar a lista e iniciar download sem manipular diretamente a API. |
| RF-08 | O serviço deve expor uma verificação de saúde. | `GET /health` retorna estado simples do processo e não expõe segredos nem dados de documentos. |

## 5. Requisitos não funcionais e regras

| ID | Requisito |
| --- | --- |
| RNF-01 | Backend em Node.js e Express, CommonJS; frontend em React e Vite, ESM; JavaScript sem TypeScript nesta fase. |
| RNF-02 | Backend organizado em `routes/`, `controllers/`, `services/` e `repositories/`, com dependências no sentido routes → controllers → services → repositories. |
| RNF-03 | Uploads gravados no filesystem local com Multer `diskStorage`, por padrão em `backend/storage`. Não usar armazenamento de terceiros. |
| RNF-04 | Metadados e sessões mantidos em memória. Reiniciar o processo elimina ambos; arquivos podem permanecer no disco sem metadados correspondentes. Essa limitação é aceita no MVP. |
| RNF-05 | Tamanho máximo padrão de 10 MiB por arquivo e allowlist padrão de PDF, DOCX, XLSX, PPTX, TXT e CSV. Limite e formatos devem ser configuráveis por ambiente. |
| RNF-06 | A validação de arquivo deve ocorrer no servidor. Não confiar apenas no nome ou no MIME declarado pelo cliente; rejeitar formatos não permitidos e entradas malformadas. |
| RNF-07 | O nome original nunca deve ser usado como caminho de armazenamento. Gerar identificador e nome interno seguros; downloads só podem resolver arquivos dentro do diretório configurado. |
| RNF-08 | Erros enviados ao cliente devem ser consistentes e não incluir stack traces, caminhos locais, credenciais ou detalhes internos. Segredos não devem ser registrados em logs. |
| RNF-09 | Configuração operacional deve vir de variáveis de ambiente, com valores padrão documentados quando aplicáveis. |
| RNF-10 | Interface deve oferecer estados de carregamento, sucesso, lista vazia e erro, e controles operáveis por teclado com rótulos acessíveis. |
| RNF-11 | Limitar uploads simultâneos, tentativas de login e armazenamento por usuário/instância para reduzir risco de exaustão de recursos. |

### Configuração mínima

| Variável | Finalidade | Padrão / regra |
| --- | --- | --- |
| `PORT` | Porta HTTP do backend. | `3000`. |
| `DMS_STORAGE_DIR` | Diretório local para arquivos. | `backend/storage`, resolvido de forma determinística pelo backend. |
| `DMS_MAX_FILE_SIZE_BYTES` | Tamanho máximo por arquivo. | `10485760` (10 MiB). Deve ser inteiro positivo. |
| `DMS_ALLOWED_EXTENSIONS` | Extensões aceitas. | `.pdf,.docx,.xlsx,.pptx,.txt,.csv`; lista separada por vírgula. |
| `DMS_USERS_JSON` | Contas permitidas e credenciais configuradas pelo operador. | Obrigatória; array JSON com `id`, `username` e `passwordHash`. Nunca retornar ou registrar seu conteúdo. |
| `DMS_SESSION_TTL_SECONDS` | Validade máxima de um token. | `3600` segundos; expirado, o usuário deve autenticar novamente. |
| `DMS_MAX_STORAGE_PER_USER_BYTES` | Limite de bytes armazenados por usuário durante a sessão do processo. | `1073741824` (1 GiB). |
| `DMS_MAX_STORAGE_BYTES` | Limite total do diretório, incluindo arquivos órfãos de processos anteriores. | `1073741824` (1 GiB). |

Configuração ausente ou inválida que impeça autenticação ou armazenamento deve impedir a inicialização e produzir mensagem operacional sem revelar segredos. O diretório deve ser privado ao processo (`0700`) e a inicialização deve contabilizar arquivos já existentes, sem removê-los automaticamente. A implantação deve proteger o acesso ao ambiente e usar HTTPS fora do desenvolvimento local.

`DMS_USERS_JSON` deve conter objetos `{ "id": "...", "username": "...", "passwordHash": "scrypt$<salt-base64url>$<key-base64url>" }`. IDs e nomes normalizados devem ser únicos. O hash usa salt aleatório por usuário com pelo menos 16 bytes e chave derivada de 64 bytes; a verificação deve usar comparação em tempo constante. Senhas em texto puro não são aceitas na configuração.

## 6. Modelo de dados

### Usuário configurado

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `id` | string | Identificador estável e único do usuário. |
| `username` | string | Nome de login único, normalizado para comparação. |
| `passwordHash` | string | Hash scrypt no formato `scrypt$<salt-base64url>$<key-base64url>`; nunca incluído em respostas ou logs. |

### Documento (metadados em memória)

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `id` | string | Identificador único imprevisível usado nas rotas. |
| `originalName` | string | Nome original sanitizado para exibição e `Content-Disposition`. |
| `size` | number | Tamanho em bytes. |
| `contentType` | string | Tipo validado pelo servidor. |
| `uploadedAt` | string | Data/hora UTC em ISO 8601. |
| `ownerId` | string | Identificador do usuário proprietário; campo interno. |
| `storageName` | string | Nome interno gerado para localizar o arquivo; nunca exposto pela API. |

O repositório de documentos deve associar o metadado ao arquivo persistido e remover arquivo parcial se uma falha ocorrer durante o upload. A ausência do registro de metadados após reinício significa que o documento não está disponível pela API.

## 7. Contratos da API

O backend atende os caminhos abaixo. No desenvolvimento, o frontend usa o prefixo `/api`; o proxy do Vite remove esse prefixo antes de encaminhar a requisição. O prefixo é configuração de desenvolvimento, não parte das rotas internas do backend.

Exceto `GET /health` e `POST /auth/login`, as rotas exigem `Authorization: Bearer <token>`. JSON usa UTF-8. Erros seguem o formato `{ "error": { "code": "...", "message": "..." } }`.

### `POST /auth/login`

- Entrada: `application/json`, `{ "username": "...", "password": "..." }`.
- Sucesso: `200`, `{ "token": "...", "tokenType": "Bearer", "expiresAt": "...", "user": { "id": "...", "username": "..." } }`.
- Credencial inválida: `401` com mensagem genérica. Corpo ausente ou inválido: `400`.
- Token deve ser imprevisível, limitado à validade configurada e armazenado apenas em memória. Credenciais e tokens não podem aparecer em logs.

### `POST /auth/logout`

- Entrada: token bearer válido.
- Sucesso: `204`; o token é invalidado imediatamente.
- Sem token válido: `401`.

O login limita falhas por IP e a concorrência de derivações scrypt. Uma nova sessão do mesmo usuário invalida a anterior.

### `GET /config`

- Não requer autenticação.
- Sucesso: `200`, `{ "maxFileSize": 10485760, "allowedExtensions": [".pdf", ".docx", ".xlsx", ".pptx", ".txt", ".csv"] }`, refletindo a configuração ativa do backend.
- A resposta não contém usuários, caminhos de armazenamento ou segredos. O frontend usa esses valores para apresentar a política vigente, mas o servidor continua sendo a autoridade de validação.

### `POST /upload`

- Entrada: `multipart/form-data` com exatamente um arquivo no campo `file`.
- Sucesso: `201` com metadados públicos do documento: `id`, `originalName`, `size`, `contentType` e `uploadedAt`.
- Campo ausente ou requisição malformada: `400`; arquivo acima do limite: `413`; formato não permitido: `415`.
- O servidor define `ownerId` a partir do token, nunca de um campo enviado pelo cliente. Nome e caminho fornecidos pelo cliente não controlam o destino em disco.

### `GET /documents`

- Sucesso: `200`, `{ "documents": [...] }`, com os metadados públicos dos documentos do usuário autenticado, ordenados do mais recente para o mais antigo.
- Sem documentos: `200`, `{ "documents": [] }`.
- A resposta não contém `ownerId`, `storageName` ou caminhos locais.

### `GET /documents/:id/download`

- Sucesso: `200` com bytes do arquivo, `Content-Type` validado e `Content-Disposition: attachment` com nome original tratado com segurança.
- ID inexistente, documento pertencente a outro usuário ou registro sem arquivo: `404`.
- A resolução do arquivo usa exclusivamente o nome interno associado ao registro e deve permanecer dentro do diretório de armazenamento.

### `GET /health`

- Sucesso: `200` com status simples, por exemplo `{ "status": "ok" }`.
- Não requer autenticação nem inclui configuração, caminhos ou informações sensíveis.

### Erros comuns

| Status | Uso |
| --- | --- |
| `400` | Corpo, campo de arquivo ou parâmetro inválido. |
| `401` | Token ausente, inválido ou expirado; credencial inválida. |
| `404` | Documento inexistente ou não pertencente ao usuário. |
| `413` | Arquivo excede o limite configurado. |
| `415` | Tipo ou extensão não permitidos. |
| `429` | Limite de tentativas de login ou uploads simultâneos atingido. |
| `500` | Falha inesperada; resposta genérica sem detalhes internos. |

## 8. Interface e fluxos

1. **Entrada:** formulário de usuário e senha; erros de autenticação são apresentados sem distinguir usuário inexistente de senha incorreta.
2. **Carregamento da lista:** após autenticação, buscar documentos do usuário. Enquanto aguarda, indicar carregamento; em falha, permitir nova tentativa; lista vazia deve ter estado próprio.
3. **Upload:** obter formatos e tamanho máximo de `GET /config`, validar também no cliente para feedback e enviar ao servidor. O cliente não substitui a validação do backend. Exibir sucesso e atualizar a lista; falha não deve remover documentos já listados.
4. **Download:** ação por documento usando seu identificador. Erros de rede ou documento indisponível devem ser comunicados sem expor detalhes internos.
5. **Sessão:** permitir logout; em `401`, limpar o token local e retornar à entrada. O token não deve ser persistido em armazenamento durável do navegador; manter apenas durante a sessão ativa da página.

Os componentes previstos no workshop são `UploadComponent`, `DocumentList` e `DownloadButton`, com chamadas `fetch` encapsuladas em `frontend/src/services/`. A organização pode evoluir sem alterar os contratos desta spec.

## 9. Arquitetura e responsabilidades

- `routes/`: declarar `/auth/login`, `/auth/logout`, `/config`, `/upload`, `/documents`, `/documents/:id/download` e `/health`, conectando middlewares aos controllers.
- `controllers/`: validar formato de entrada HTTP e mapear resultados/erros para status e respostas.
- `services/`: aplicar regras de autenticação, autorização por dono, validação de upload e fluxo de documentos.
- `repositories/`: encapsular usuários configurados, sessões em memória, metadados em memória e acesso ao filesystem local.
- Frontend React: componentes funcionais com Hooks; serviço de API via `fetch` e proxy `/api` do Vite no desenvolvimento.
- Dependências devem seguir `routes → controllers → services → repositories`; camadas internas não dependem de Express ou de componentes React.

## 10. Critérios de aceitação

- Usuário configurado consegue autenticar; credenciais inválidas são rejeitadas sem revelar qual campo falhou.
- Token válido permite as operações; logout e expiração fazem o token deixar de funcionar.
- Usuário A não consegue listar nem baixar documentos de usuário B, inclusive tentando adivinhar o identificador; a resposta de download não confirma a existência do documento alheio.
- Upload de cada formato permitido, dentro dos limites por arquivo, usuário e instância, gera metadados corretos e arquivo no diretório local; formato não permitido e arquivo acima do limite retornam os status definidos.
- Nome de arquivo com caracteres incomuns não altera o caminho de destino nem o cabeçalho de download; tentativa de caminho externo não é aceita.
- Lista vazia, sucesso, carregamento, erros HTTP e logout são tratados pela interface.
- Após reiniciar o backend, os arquivos podem continuar em disco, mas metadados e tokens anteriores não estão disponíveis; nova autenticação é necessária.
- `GET /health` responde sem autenticação e sem dados sensíveis.
- `GET /config` reflete a allowlist e o tamanho máximo configurados; a UI não mantém uma cópia independente dessa política.
- Testes backend (`node --test`) cobrem contratos, validações, autorização e isolamento; build frontend (`npm run build`) conclui sem erros.

## 11. Ordem sugerida de implementação

1. Definir configuração e validação de inicialização; implementar repositórios em memória e armazenamento local seguro.
2. Implementar autenticação, sessão bearer, middleware de autenticação e logout.
3. Implementar serviços e rotas de upload, listagem e download com isolamento por proprietário.
4. Cobrir sucesso, erros, limites, autorização e isolamento com testes de integração backend.
5. Implementar serviço frontend, entrada, listagem, upload e download; validar estados da interface e build.
6. Executar revisão de segurança e fluxo manual completo em ambiente local.

## 12. Referências e estado atual

Esta especificação expande [`spec-template.md`](spec-template.md), respeitando as restrições de [instruções do projeto](../../.github/copilot-instructions.md). O teste de integração verifica autenticação, isolamento e upload/download no app montado; login, sessão e quotas permanecem em memória nesta fase.