# Conectar o frontend Next.js

O frontend na pasta vizinha `hello-cliente` está integrado por `src/providers/api-provider.tsx` e `src/services/api.ts`. As telas usam a API para autenticação e persistência. Não substitua autenticação por um ID de usuário enviado pelo navegador.

## Cliente HTTP

Defina somente a URL pública da API em `NEXT_PUBLIC_API_URL`. Mantenha o access token em memória e envie `Authorization: Bearer <token>` nos recursos privados. Não armazene refresh token, segredos ou credenciais do banco em localStorage.

Exemplo conceitual de login:

```ts
const response = await fetch(`${apiUrl}/api/v1/auth/login`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ whatsapp: "+5511999999999", password }),
});
const payload = await response.json();
if (!response.ok) throw new Error(payload.error.message);
// Guardar payload.data.accessToken em memória e carregar GET /users/me.
```

O navegador fornece Origin automaticamente. Configure CORS_ORIGINS com a origem exata do Next.js. Testes via curl/Postman dos POSTs de autenticação devem enviar esse cabeçalho explicitamente.

## Sessão

Após recarregar a página, chame POST /auth/refresh com credentials: include para obter novo access token. Centralize/serialize a renovação para evitar uso concorrente do refresh rotativo. Ao receber 401, renove uma vez; se falhar, encerre a sessão visual. Nunca faça loop infinito de refresh. Logout usa POST /auth/logout com credentials: include e remove o access token da memória.

OAuth começa por navegação completa para `/api/v1/auth/oauth/github` ou `/linkedin`. O callback no backend define o cookie e volta para `/entrar/?oauth=success`. Nesse retorno, o frontend deve renovar a sessão e buscar `/users/me`; nenhum token de acesso é colocado na URL.

## Mapeamento dos fluxos

### Vincular GitHub ou LinkedIn

Entre primeiro pelo provedor original como DEVELOPER. Envie
`POST /api/v1/auth/oauth/linkedin/link` (ou `github/link`) com Bearer token,
`credentials: "include"`, Origin autorizado e corpo `{}`. A resposta contém
`data.authorizationUrl`; navegue para ela na mesma sessão de navegador.
Não envie userId nem tokens na URL. O destino do vínculo é determinado pela sessão
autenticada, armazenado no Redis e revalidado no callback.

Após autorizar, o callback retorna para `/entrar/?oauth=linked`. Essa operação
preserva a sessão atual e não emite novo cookie de refresh. Os callbacks cadastrados
nos provedores continuam iguais. O frontend pode exibir a confirmação e carregar
`GET /users/me`. Depois, o usuário poderá entrar por qualquer provedor vinculado.

O fluxo é exclusivo de DEVELOPER e não mescla contas existentes. `OAUTH_ACCOUNT_IN_USE`
indica identidade já vinculada a outro usuário; `ACCOUNT_LINK_REQUIRED` indica e-mail
pertencente a outra conta. Sessão expirada/revogada exige reiniciar a vinculação.

| Frontend          | API                                                                          |
| ----------------- | ---------------------------------------------------------------------------- |
| Vitrine           | GET /projects                                                                |
| Detalhes          | GET /projects/{id}                                                           |
| Cadastro          | POST /auth/register diretamente, sem código de verificação    |
| Recuperação       | Indisponível por enquanto; ocultar a opção de recuperação |
| Meus sistemas     | GET /merchant/matches                                                        |
| Adotar            | POST /merchant/matches com projectId, termsVersion 1.0 e acceptTerms true    |
| Revogar           | POST /merchant/matches/{id}/revoke com confirm true                          |
| Meus projetos     | GET /developer/projects                                                      |
| Enviar/editar     | POST /developer/projects ou PUT /developer/projects/{id}                     |
| Solicitações      | GET /developer/revocations                                                   |
| Declarar exclusão | POST /developer/revocations/{id}/declare com confirm true                    |
| Moderação         | GET /admin/projects e POST /admin/projects/{id}/moderation                   |
| Saúde/histórico   | GET /admin/projects/{id}/history                                             |
| Perfil            | GET/PATCH /users/me                                                          |

Os IDs reais são UUIDs, diferentes dos slugs fictícios do frontend. Normalize DTOs na camada HTTP; não espere campos ilustrativos como `color`, `icon`, `features` ou `tagline` no banco. A lista paginada fica em `data.items`; o projeto público tem `developer: { id, name }`. A descrição pode alimentar a apresentação do cartão.

O cadastro da demonstração chamava o ramo de `sector`; a API espera `businessSector`. Atualize o formulário de senha para o mínimo de 12 caracteres e respeite o teto bcrypt de 72 bytes. A edição de contato não altera e-mail verificado ou WhatsApp; mudanças nesses identificadores precisam de um fluxo específico de verificação.

Depois da adoção bem-sucedida, use `data.redirectUrl` para navegar. Não redirecione antes de confirmar a gravação. Mostre 409 como conflito/adoção em exclusão pendente e 422 nos campos. O prazo de revogação deve vir do servidor. Notificação aceita no SMTP não significa dados excluídos: apresente os estados separadamente.

Antes do lançamento, estabeleça a correlação do lojista/Match com os sistemas externos. Não envie JWT da plataforma para a productionUrl nem permita que o sistema externo escolha arbitrary redirects na autenticação.
