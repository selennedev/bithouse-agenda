# Bithouse Agenda — Supabase em tempo real

## 1. Banco
Abra o Supabase do projeto Bithouse → SQL Editor → cole `supabase_schema.sql` → Run.

O schema:
- usa `auth.users` como fonte dos IDs;
- cria `profiles` automaticamente quando um usuário é criado;
- evita o problema de FK `profiles_id_fkey` causado por UUID que não existe em `auth.users`;
- cria comissões, assets, tarefas, agenda, equipe e histórico;
- ativa RLS para usuários autenticados;
- prepara Realtime para comissões, assets, tarefas, agenda e perfis.

## 2. Configuração do site
Abra `config.js` e troque:
COLE_AQUI_A_PROJECT_URL
COLE_AQUI_A_PUBLISHABLE_KEY

Use a chave publicável/anon apropriada ao cliente. NUNCA coloque service_role no navegador.

## 3. Usuários
No Supabase → Authentication → Users, crie os e-mails da equipe.

Depois que cada pessoa entrar pelo link enviado por e-mail, o perfil será criado automaticamente.

Depois, em Table Editor → profiles, ajuste:
- name
- role
- specialty
- hours_per_day
- days_per_week

## 4. Realtime
O SQL já adiciona as tabelas operacionais à publicação `supabase_realtime`.

## 5. GitHub Pages
Envie:
- index.html
- style.css
- app.js
- config.js
- supabase_schema.sql (pode ficar no repositório ou fora; não é executado pelo site)

Depois ative GitHub Pages.

## 6. Segurança
O site só libera os dados para usuários autenticados. O banco usa Row Level Security.

Para uma primeira versão interna da Bithouse, todos os usuários autenticados podem operar os dados. Depois podemos criar permissões mais granulares:
- sócio: tudo;
- colaborador: tarefas/assets atribuídos;
- convidado: somente leitura.

## 7. Arquivos
Os arquivos dos assets continuam no Google Drive. O sistema guarda somente organização, responsáveis, status, horas e links de referência/Drive quando adicionarmos esse campo.

## 8. Próxima evolução recomendada
- botão de check em Modelagem / Texturização / Rig / Exportação;
- cada check grava quem fez;
- links para pastas do Drive;
- comentários por asset;
- histórico "Selenne marcou X às 14:32";
- calendário drag-and-drop;
- visão por comissão e por mapa;
- alertas de sobrecarga;
- dashboard de prazo.
