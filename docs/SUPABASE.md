# Configuração do Supabase

Este projeto usa PostgreSQL através do Prisma. Não utiliza a anon key, service_role key nem Supabase Auth.

## 1. Projeto e conexão

No painel do Supabase, abra Connect e copie a conexão Direct ou Session Pooler. Para API Node persistente, o Session Pooler na porta 5432 funciona em redes IPv4. Conexão direta normalmente depende de IPv6 ou add-on apropriado. Não copie os placeholders do exemplo como se fossem endereços reais.

Use `DIRECT_URL` para migrations, com o proprietário de migrações; use `DATABASE_URL` para o runtime, com `hello_runtime`. Não use o modo Transaction (6543) para migrations. A senha deve ser percent-encoded na URL se contiver caracteres reservados.

O arquivo `.env.example` mostra os formatos. Prisma 7 lê a conexão da CLI em `prisma.config.ts`; a aplicação usa `pg` + `@prisma/adapter-pg`. A pool local começa com no máximo 5 conexões por processo. Some API, workers e réplicas ao dimensionar o limite do Supabase.

## 2. Migração inicial

A migration fornecida cria as tabelas. Ela é destinada a um schema novo para este backend. Se você já aplicou o schema anterior ou possui tabelas com os mesmos nomes, faça backup e crie uma migration de evolução/baseline antes de executar; não aplique a inicial sobre tabelas existentes.

Novos campos em relação ao schema anterior: sessões rotativas, credencial de admin, aceite de cadastro, snapshot de URL na adoção, leases de healthcheck, corpo de notificação e auditoria de tentativas.

```bash
npm ci
npm run db:generate
npm run db:deploy
```

Use `migrate deploy` no Supabase. `migrate dev` destina-se a um banco de desenvolvimento com shadow database configurado; não use contra produção. A migration já inclui o índice único parcial, CHECKs, RLS e revogação dos acessos públicos — não é necessário copiar constraints.sql manualmente nesta entrega.

## 3. Papel de runtime

Execute `scripts/supabase-runtime-role.sql` no SQL Editor como o mesmo proprietário que criou as tabelas. O script cria o grupo sem login `hello_app`, o login restrito `hello_runtime`, os grants para as tabelas conhecidas e políticas de RLS exclusivas para esse grupo.

Defina uma senha aleatória para hello_runtime no SQL Editor privado e configure DATABASE_URL usando esse usuário. Em Session Pooler, o nome segue o formato `hello_runtime.PROJECT_REF`. Em conexão direta, use `hello_runtime`. A URL de migration usa o dono das tabelas e fica fora do processo público sempre que a infraestrutura permitir separar os ambientes.

O runtime não recebe CREATEDB, CREATEROLE ou BYPASSRLS. A política do grupo backend permite operar os registros da aplicação; os filtros de usuário/papel são responsabilidade da API. Os usuários anon/authenticated da Data API não recebem políticas nem grants. Se a Data API não for necessária neste projeto Supabase, desative-a nas configurações como recomendado pela documentação oficial.

## 4. TLS

Mantenha `DB_SSL=true`. A aplicação exige certificado válido e hostname correspondente. Se a conexão exigir a CA específica do projeto, baixe o certificado pelo painel e informe `DB_SSL_CA_FILE` apontando para um arquivo montado no servidor. Não use `rejectUnauthorized=false` nem `NODE_TLS_REJECT_UNAUTHORIZED=0`.

Para o Prisma CLI, configure a URL e o certificado segundo o ambiente do Supabase/Prisma, preferindo `sslmode=verify-full` e o CA necessário. O runtime remove parâmetros de SSL da URL e aplica a política explícita do Pool para impedir overrides acidentais.

## 5. Antes do uso real

- Confirme acesso da API com o runtime restrito e rejeição via anon/authenticated.
- Execute o fluxo cadastro → adoção → revogação e verifique o worker com SMTP de teste.
- Configure backups, monitoração e retenção segundo sua operação.
- Nunca envie credenciais ao repositório, frontend ou logs.

Documentação oficial: https://supabase.com/docs/guides/database/prisma
