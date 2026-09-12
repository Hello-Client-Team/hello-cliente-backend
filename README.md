# Hello Cliente — backend MVC

API REST para Node.js, Express 5 e TypeScript estrito. PostgreSQL no Supabase acessado por Prisma 7, validação Zod, autenticação própria JWT/bcrypt, filas BullMQ/Redis, OAuth GitHub/LinkedIn, cadastro com WhatsApp/senha e e-mail SMTP.

O Supabase é o banco do projeto. Este código NÃO usa Supabase Auth, não hospeda sistemas adotados e não processa pagamentos de lojistas. API e workers são processos Node persistentes; não são Supabase Edge Functions.

## Iniciar

1. Instale Node.js 22.12+ e execute `npm ci`.
2. Copie `.env.example` para `.env` e preencha os valores. Gere JWT_SECRET com o comando indicado no arquivo.
3. Configure o banco conforme [docs/SUPABASE.md](docs/SUPABASE.md).
4. Execute `npm run db:generate`, `npm run db:deploy` e o SQL de permissões do runtime conforme o guia.
5. Inicie Redis 7+ com AOF e política `noeviction`.
6. Em terminais separados: `npm run dev` e `npm run worker:dev`.

Em produção, compile com `npm run build` e execute `npm start` e `npm run worker` em processos separados. O arquivo `compose.yaml` oferece API, worker e Redis; o PostgreSQL permanece no Supabase. Configure domínio, HTTPS e variáveis adequadas antes de usar `docker compose up --build -d`. Por padrão, a porta da API no Compose é exposta somente em localhost para uso atrás de proxy. A imagem usa usuário sem privilégios.

Credenciais não foram fornecidas nesta sessão: nenhum banco remoto foi migrado, nenhuma conta real foi criada e nenhuma mensagem foi enviada.

## Arquitetura MVC

| Diretório          | Responsabilidade                                          |
| ------------------ | --------------------------------------------------------- |
| `src/models`       | Consultas reutilizáveis e acesso a modelos persistidos    |
| `prisma`           | Modelo relacional, índices, CHECKs e migration completa   |
| `src/controllers`  | Entrada HTTP, validação e resposta; sem lógica de filas   |
| `src/views`        | Representação JSON pública; exclui credenciais            |
| `src/services`     | Casos de uso e transações de negócio                      |
| `src/routes`       | Endpoints e composição de permissões                      |
| `src/validators`   | Contratos Zod e bloqueio de mass assignment               |
| `src/middlewares`  | Autenticação, autorização, CORS/CSRF, limites e erros     |
| `src/security`     | JWT, tokens opacos e HTTP protegido contra SSRF           |
| `src/integrations` | Adaptadores de WhatsApp e SMTP                            |
| `src/workers`      | Dispatcher outbox, healthcheck e notificações             |
| `src/config`       | Configuração validada, banco, Redis e logs                |
| `tests`            | Regras de segurança, autorização e integridade PostgreSQL |

Em uma API MVC, a View é a representação JSON consumida pelo frontend. Services mantêm transações e regras fora dos controllers. Operações transacionais usam o cliente Prisma da mesma transação para que nenhuma gravação escape do commit/rollback. Não há camada abstrata genérica para cada método CRUD: os modelos encapsulam consultas reutilizadas e os services coordenam alterações com significado de negócio.

## Regras implementadas

- Submissão sempre PENDING. Edição também retorna para análise; somente o dev responsável pode editar.
- Aprovação/rejeição e histórico de moderação são gravados juntos. Rejeição exige justificativa.
- Vitrine e detalhes públicos mostram somente APPROVED.
- Adoção exige lojista, aceite da versão 1.0 e projeto aprovado. Índice parcial impede dois Matches ativos para o mesmo par lojista/projeto.
- Adoção guarda snapshot da URL. O backend retorna `redirectUrl`; o frontend realiza a navegação externa após sucesso.
- Revogação idempotente grava Match REVOKED, solicitação e evento outbox na MESMA transação.
- Prazo de 48 horas desde a solicitação, com CHECK no banco. O dispatcher não prorroga o prazo por falhas no e-mail.
- Notificação preserva destinatário, conteúdo, versão, hash SHA-256, Message-ID e tentativas de envio. Aceitação pelo SMTP não prova entrega ou leitura nem confere, por si só, valor jurídico.
- Dev só consulta/declara exclusões dos próprios projetos. A declaração é idempotente. Readopção fica bloqueada enquanto a declaração anterior estiver pendente.
- Healthcheck GET a cada 6 horas e suspensão após 3 falhas consecutivas, configuráveis. HTTP 4xx/5xx, timeout e falhas de rede contam como falha; sucesso zera o contador.
- Suspensos continuam sendo verificados; a reativação exige aprovação administrativa.
- DNS é validado e fixado na conexão; redirects são revalidados, limitados e compartilham um prazo total. Não são baixados corpos de resposta. Resultados de verificações obsoletas não alteram um projeto editado durante a consulta.

## Segurança

JWT HS256 com issuer/audience fixos, validade de 15 minutos e referência à sessão revogável no banco. Refresh token aleatório é armazenado somente como hash SHA-256, enviado em cookie HttpOnly e rotacionado a cada uso. Logout/reset invalidam sessões no banco. O frontend deve serializar refresh para não disputar a rotação.

Senhas bcrypt com custo 12, mínimo de 12 caracteres no cadastro e máximo de 72 bytes UTF-8. O número de WhatsApp é normalizado pelo contrato E.164, mas não é verificado. Cadastro e login não dependem de Twilio; novos cadastros mantêm `whatsappVerifiedAt` nulo. O cadastro público não aceita role, IDs de proprietário ou status.

Cada endpoint privado exige sessão ativa e papel adequado. Filtragem por proprietário evita IDOR. Operações críticas usam isolamento serializável com retentativas limitadas. Limites por IP e identidade usam Redis; indisponibilidade do Redis não libera requisições sem limitação.

CORS é restrito a origens explícitas. Operações POST de autenticação exigem Origin autorizado, protegendo cookies contra CSRF. A API não confia em X-Forwarded-For sem configuração explícita de TRUST_PROXY. Configure somente endereços/sub-redes dos seus proxies. Cookies de produção são Secure; para frontend e API em sites diferentes, use COOKIE_SAME_SITE=none e HTTPS, considerando as restrições de cookies de terceiros dos navegadores.

Helmet, limite JSON de 32 KB, paginação limitada, queries parametrizadas, TLS com validação de certificado e logs sem corpos, cookies, tokens ou query strings. Não exponha `DATABASE_URL`, `DIRECT_URL`, segredos OAuth ou JWT no Next.js. Não retorne erros SQL ou stacks ao cliente.

A conta runtime do PostgreSQL tem acesso às tabelas da aplicação e é protegida por credenciais somente no servidor. RLS bloqueia anon/authenticated da Data API; o papel backend recebe política própria. Isolamento de lojistas é aplicado pela API, pois JWT próprio não é uma sessão do Supabase. Configure o runtime com o papel restrito, nunca com o dono do banco.

## Integrações

- WhatsApp: cadastro direto com número e senha, sem código. `/auth/verifications` e `/auth/password/reset` retornam 503 enquanto estiverem desativados. A recuperação de senha precisa de um novo mecanismo de confirmação de identidade antes de ser reativada.
- GitHub: OAuth App com callback `{API_URL}/api/v1/auth/oauth/github/callback`; scopes `read:user user:email`, state de uso único e PKCE S256. Exige e-mail verificado.
- LinkedIn: habilite Sign In with LinkedIn using OpenID Connect e registre callback `{API_URL}/api/v1/auth/oauth/linkedin/callback`; scopes `openid profile email`, state de uso único e consulta ao endpoint UserInfo por token. Não usa ID token não validado.
- Contas não são unidas automaticamente por e-mail. Desenvolvedores podem entrar pelo provedor original e iniciar `POST /api/v1/auth/oauth/{provider}/link` com Bearer e Origin autorizado. Abra `data.authorizationUrl` no mesmo navegador para confirmar o novo provedor. O callback revalida a sessão e retorna ao frontend com `oauth=linked`, sem trocar a sessão. Identidades ou e-mails pertencentes a outras contas são recusados. Consulte o guia de frontend para integrar esse fluxo.
- SMTP: configure remetente autorizado, host e credenciais. O conteúdo é texto puro; SMTP de produção exige TLS. A infraestrutura de envio deve configurar SPF/DKIM/DMARC e monitoração de bounces, conforme o provedor.

Sem configuração, integrações falham explicitamente; não simulam envios bem-sucedidos. Credenciais de provedores nunca são gravadas em eventos.

## Workers e observabilidade

Execute ao menos um processo `worker`. O dispatcher percorre a outbox a cada 15 segundos com claims e lease. Jobs usam IDs estáveis, retentativas exponenciais e reconciliação de notificações não aceitas. Redis deve usar persistência AOF, backup e `noeviction`. Configure TLS/autenticação para Redis remoto; não o exponha publicamente.

O e-mail segue entrega pelo menos uma vez. Uma falha depois de o SMTP aceitar e antes de o banco confirmar pode causar repetição; Message-ID estável ajuda na correlação, mas SMTP não garante exatamente uma vez. A auditoria registra tentativas sem afirmar entrega/leitura. Configure alertas para `job_failed`, `outbox_publish_failed`, `dispatcher_tick_failed` e para os contadores de `/admin/operations`.

`GET /health/live` verifica o processo; `GET /health/ready` consulta PostgreSQL e Redis. API e worker encerram conexões ao receber SIGTERM/SIGINT. Sessões expiradas há 30 dias e healthchecks com mais de 30 dias são limpos em lotes. Eventos, contas, adoções e evidências precisam de política de retenção/anonymização antes do lançamento; não há exclusão automática indiscriminada desses registros.

O direito de excluir a conta da plataforma não se confunde com a revogação de um Match. Um fluxo completo de encerramento/anonymização da conta é uma evolução separada deste escopo de revogação por sistema.

## Administração

Não há cadastro público de administradores. Em uma sessão privada de terminal, defina ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD no ambiente e execute `npm run admin:create`. O comando recusa e-mail já existente e não promove usuários silenciosamente. Retire as variáveis da sessão após o uso. MFA administrativo e políticas organizacionais podem ser acrescentados antes de uma operação de maior risco.

## Documentação e frontend

Acesse o Swagger UI em `http://localhost:3333/docs` para explorar e testar os endpoints. O contrato é servido em `/docs/openapi.json`, a partir de `docs/openapi.json`, com a base `/api/v1` da própria API. Use **Authorize** com o access token JWT para as rotas protegidas; a interface não persiste o token após recarregar a página.

Para testar os POSTs de autenticação pelo Swagger, inclua a origem da API em `CORS_ORIGINS` (por exemplo, `http://localhost:3000,http://localhost:3333`). A validação de Origin continua obrigatória. As operações executadas pela interface usam os serviços e dados configurados no `.env`.

Importe [docs/openapi.json](docs/openapi.json) no Swagger Editor/Postman/Insomnia. Consulte [docs/FRONTEND.md](docs/FRONTEND.md) para substituir o provider de demonstração do frontend. A integração não foi aplicada automaticamente ao site criado anteriormente: esta entrega é o backend e seus contratos.

No modelo Non-Hosting, o desenvolvedor precisa correlacionar o identificador do lojista/Match aos dados coletados no sistema externo. A API retorna os IDs na adoção e na solicitação; o simples redirecionamento não cria essa correlação. Defina esse contrato com os sistemas participantes antes de aceitar dados reais. URLs externas não recebem tokens da plataforma automaticamente.

## Verificar

```bash
npm run db:generate
npm run typecheck
npm test
npm run build
```

Os testes usam PostgreSQL embarcado (PGlite) para executar a migration completa e validar índices, rollback e RLS; não são uma conexão com o projeto real no Supabase. Testes unitários cobrem JWT, sessão revogada, papéis, CSRF, URLs, limite bcrypt e estados do healthcheck. Verificações com Supabase, Redis/BullMQ, SMTP e OAuth reais dependem das credenciais e do ambiente de execução.

## Referências

- Supabase + Prisma: https://supabase.com/docs/guides/database/prisma
- Segurança Express: https://expressjs.com/en/advanced/best-practice-security/
- OAuth GitHub: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
- LinkedIn OIDC: https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2
- Twilio Verify: https://www.twilio.com/docs/verify/api/verification-check
