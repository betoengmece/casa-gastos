# Casa — Gastos de Beto e Mari

PWA responsiva para controle compartilhado de despesas, otimizada para Safari no iPhone. Funciona offline e sincroniza alterações pontuais com Supabase/PostgreSQL quando configurado.

## Recursos

- Cadastro, edição, lixeira e restauração de despesas.
- Identificação automática de Beto ou Mari após a primeira escolha no aparelho.
- Despesas individuais ou conjuntas; as conjuntas são divididas 50/50 nos relatórios individuais.
- Compras parceladas geram lançamentos mensais vinculados.
- Forma de pagamento sugerida a partir das últimas escolhas.
- Relatórios por pessoa e categoria.
- Auditoria com autor, horário e resumo de cada alteração.
- Armazenamento offline em IndexedDB, fila de sincronização e detecção de conflitos por versão.
- Manifesto e service worker para instalação na tela inicial do iPhone.

## Configuração do Supabase

1. Crie um projeto gratuito no Supabase e habilite **Anonymous Sign-Ins**.
2. Execute `supabase/migrations/001_initial.sql` no editor SQL.
3. Copie `.env.example` para `.env.local` e preencha a URL, a chave publicável e um código longo e aleatório para o casal.
4. Inicie o app. O primeiro aparelho cria a Casa silenciosamente; o segundo entra nela usando o mesmo código.

Sem essas variáveis, o aplicativo abre em modo demonstrativo local. Nenhuma chave administrativa deve ser colocada no navegador ou no repositório.

## Desenvolvimento

Requer Node.js 22.13 ou mais recente.

```bash
npm install
npm run dev
```

Para validar a versão de produção:

```bash
npm run build
```
