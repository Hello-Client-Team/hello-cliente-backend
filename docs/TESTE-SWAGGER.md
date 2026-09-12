# Teste manual pelo Swagger

Abra http://localhost:3333/docs. Os caminhos abaixo usam a base `/api/v1`.
Este roteiro ainda precisa ser executado; não é um relatório de testes aprovados.

Use contas e um projeto destinados a testes. A revogação dispara um e-mail real
para o endereço do desenvolvedor. Use um endereço que você controla.
Use uma URL pública de projeto que você controla, pois o worker realiza healthchecks.

## Contas e sessões

São necessários três papéis: MERCHANT (cadastro público), ADMIN (conta criada pelo
script) e DEVELOPER (login por GitHub ou LinkedIn). O cadastro público não aceita
`role` e não cria desenvolvedores. Configure um dos provedores OAuth antes da etapa 4.

No **Authorize**, informe apenas o access token. Ao trocar de papel, substitua esse
token. Confira o papel ativo com `GET /users/me` antes de cada ação protegida.
O cookie de refresh pertence ao último login feito naquele navegador, independentemente
do token no Authorize. Termine o teste de refresh/logout antes de trocar de conta,
ou use perfis de navegador separados para cada papel.

## 1. Cadastro do lojista

Execute `POST /auth/register` com um número que você controla e uma senha de teste
exclusiva, de pelo menos 12 caracteres. Substitua os campos ilustrativos abaixo:

```json
{
  "name": "Lojista de Teste",
  "whatsapp": "+5511999999999",
  "password": "SUBSTITUA_POR_SENHA_DE_TESTE",
  "businessName": "Loja de Teste",
  "businessSector": "Varejo",
  "termsVersion": "1.0"
}
```

Esperado: **201**, `data.user.role = MERCHANT`, `data.accessToken` e cookie
HttpOnly `hc_refresh`. Não envie `code`. Um número já cadastrado não cria outra conta.

## 2. Login e perfil

Execute `POST /auth/login` com `whatsapp` e `password` da conta criada.
Esperado: **200**. Coloque `data.accessToken` no Authorize e execute `GET /users/me`.
Esperado: **200**, com o usuário e papel MERCHANT.

## 3. Refresh e logout

Sem trocar de conta, execute `POST /auth/refresh`, sem corpo. O navegador envia
o cookie automaticamente. Esperado: **200**, novo access token e rotação do cookie.
Atualize o Authorize e confirme `GET /users/me` com **200**.

Execute `POST /auth/logout`, sem corpo. Esperado: **204**.
Mantendo o token no Authorize, execute `GET /users/me`: esperado **401**.
Execute `POST /auth/refresh`: esperado **401**.
Faça login novamente como lojista antes de continuar.

## 4. Publicação pelo desenvolvedor

Faça login OAuth por navegação normal no navegador:
`http://localhost:3333/api/v1/auth/oauth/github` (ou `/linkedin`). Não use o botão
Execute do Swagger para iniciar a navegação OAuth.

Após o callback, volte ao Swagger na mesma sessão de navegador, execute
`POST /auth/refresh` e use o token retornado no Authorize. O callback redireciona
ao frontend; mesmo que essa página ainda não esteja disponível, confira se o callback
concluiu e definiu o cookie antes de tentar o refresh.
Confirme `GET /users/me` com papel DEVELOPER e seu e-mail correto.

Execute `POST /developer/projects`, substituindo as URLs por endereços de teste
públicos que você controla:

```json
{
  "title": "Projeto para teste completo",
  "category": "Vendas",
  "description": "Projeto exclusivo para validar o fluxo completo da plataforma.",
  "productionUrl": "https://SEU-DOMINIO-DE-TESTE",
  "demoUrl": "https://SEU-DOMINIO-DE-TESTE/demo"
}
```

Esperado: **201**, status PENDING. Guarde `data.id` como `projectId`.
O projeto ainda não deve aparecer em `GET /projects`.

## 5. Aprovação pelo administrador

Execute `POST /auth/admin/login` com e-mail e senha do administrador. Troque o
Authorize para seu token e confirme o papel ADMIN em `GET /users/me`.

Execute `POST /admin/projects/{projectId}/moderation`:

```json
{"decision":"APPROVED"}
```

Esperado: **200**, status APPROVED. Confirme que `GET /projects/{projectId}` retorna
o projeto e que `GET /admin/projects/{projectId}/history` contém a aprovação.

## 6. Adoção pelo lojista

Faça login novamente como lojista e atualize o Authorize.
Execute `POST /merchant/matches`:

```json
{"projectId":"UUID_DO_PROJETO","termsVersion":"1.0","acceptTerms":true}
```

Esperado na primeira adoção: **201**. Guarde `data.match.id` como `matchId` e
confira `data.redirectUrl`. Repetir a adoção ativa retorna **200**, sem duplicá-la.
Confirme o vínculo em `GET /merchant/matches`.

## 7. Revogação

Ainda como lojista, execute `POST /merchant/matches/{matchId}/revoke`:

```json
{"confirm":true}
```

Esperado: **200**. Guarde `data.id` como `revocationId`. Confira `requestedAt` e
`deletionDeadlineAt` (48 horas após a solicitação). O match deve estar REVOKED.
Repetir essa chamada deve retornar a mesma revogação.

## 8. Notificação

Aguarde o dispatcher, que executa a cada 15 segundos, e o processamento do envio.
Volte à sessão do desenvolvedor e consulte `GET /developer/revocations`.
Confira a revogação do teste e `notificationAcceptedAt` preenchido após aceite SMTP.
Confira também a caixa de entrada e spam do e-mail do desenvolvedor.
Aceite SMTP e recebimento na caixa de entrada são verificações distintas.

Se o e-mail não chegar, consulte `GET /admin/operations` como administrador e
os logs com `docker compose logs --tail 50 worker`. Não declare sucesso apenas
porque a conexão SMTP foi validada.

## 9. Declaração de exclusão pelo desenvolvedor

Para este projeto de teste, confirme que não há dados externos reais pendentes de
exclusão. Como desenvolvedor proprietário, execute
`POST /developer/revocations/{revocationId}/declare`:

```json
{"confirm":true}
```

Esperado: **200**, status DECLARED_DELETED e `deletionDeclaredAt` preenchido.
Repetir a chamada deve preservar a declaração original.
A plataforma registra a declaração; ela não apaga dados em sistemas externos.

## Conferências de autorização

- Token de lojista em uma rota administrativa: **403**.
- Token de administrador em uma rota exclusiva de desenvolvedor: **403**.
- Rota protegida sem token: **401**.
- Token da sessão encerrada após logout: **401**.

Anote os códigos HTTP e os IDs de teste, sem registrar senhas, tokens ou cookies.
