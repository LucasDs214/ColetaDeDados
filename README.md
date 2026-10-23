# FAETEC — Plataforma de Coleta (Instrumentos 1, 2 e 6)

C# (.NET 8, minimal API + EF Core) · React (Vite) · SQLite (testes) / PostgreSQL-Supabase (validação) · Docker Compose.

**Esta versão não tem login**: qualquer pessoa com acesso à URL vê os questionários, cadastra alunos, responde e exporta CSV.
Use **somente dados fictícios** enquanto estiver assim (veja “Segurança”).

## Testar localmente (SQLite)

**Com Docker**
```bash
cp .env.sqlite.example .env
docker compose up -d --build        # http://localhost:8080
```
**Sem Docker (desenvolvimento)**
```bash
cd backend  && ASPNETCORE_URLS=http://localhost:5000 dotnet run     # cria backend/data/faetec.db
cd frontend && npm install && npm run dev                           # http://localhost:5173
```
Na primeira execução o banco é criado com **20 alunos de demonstração** (`DEMO-001` … `DEMO-020`).
Para recomeçar do zero: apague o arquivo `.db` (ou `docker compose down -v`). Para não criar os alunos: `SEED_DEMO=false`.
Alunos podem ser excluídos pela tela do participante.

## Subir para testes da equipe (Supabase)

1. No Supabase, crie o projeto e anote a senha do banco.
2. **Connect → Session pooler** (IPv4; a conexão direta `db.<ref>.supabase.co` é só IPv6) e monte a string no formato Npgsql:
   `Host=aws-0-<regiao>.pooler.supabase.com;Port=5432;Database=postgres;Username=postgres.<ref>;Password=<senha>;SSL Mode=Require;Trust Server Certificate=true`
3. `cp .env.supabase.example .env`, preencha `DB_CONNECTION`.
4. `docker compose up -d --build` em um servidor acessível pela equipe (VPS, Render, Fly.io, Railway…). O Supabase hospeda só o banco; a API e o site rodam nos containers `api` + `web`.
5. As tabelas e os 20 alunos são criados na primeira execução. A API ativa **RLS** nas tabelas (sem políticas), bloqueando a API REST pública do Supabase; só esta aplicação acessa.
6. Use o pooler em modo **session (5432)**, não o transaction (6543).

## Telas
- **Painel:** boas-vindas, progresso por instrumento, atividade das últimas 8 semanas e últimas respostas.
- **Instrumentos:** cada card abre a lista de alunos (filtros Pendentes / Rascunhos / Completos) → clique para responder.
- **Formulário:** barra de progresso fixa, condicionais automáticas, salvar rascunho ou finalizar (valida obrigatórias).
- **Participantes:** busca, filtro por unidade, cadastro/edição/exclusão e situação de cada questionário.
- **Exportar CSV:** consolidado, por instrumento e cadastro.

| Módulo | Conteúdo |
|---|---|
| Instrumento 1 | Q2, Q7–Q21. Q1, Q3–Q6 e e-mail ficam no cadastro do participante. |
| Instrumento 2 | Q22–Q27 em **M1, M2 e M3**; altura média, IMC e alerta se as alturas diferirem mais de 0,5 cm. Q22/Q23 só para meninas. |
| Instrumento 6 | CCEB 2026 com escore, classe e renda média (tabelas do caderno). |

Os instrumentos vivem em `shared/instruments.json` (formulário, validação, cálculo e colunas do CSV). Edite e reconstrua para ajustar textos/opções.

## Exportação CSV
`;` como separador, UTF-8 com BOM, decimal com vírgula (opção: ponto).
- Colunas: `codigo, escola, serie_turma, idade_anos, momento` + variáveis (`q07_sexo_biologico`, …) + calculados + `<instrumento>_status`.
- Múltipla escolha vira colunas 0/1 (`q27_avaliacao_questionario__1`…); medicamentos viram `q16_n` e `q16_<n>_<campo>` (até 5).
- Opção “rótulos” troca códigos pelo texto. **Padrão pseudonimizado** (sem nome, nascimento e e-mail).
- Vazio = dado ausente. Datas em AAAA-MM-DD. Nomes de colunas em ASCII (sem acento/espaço).
- **Dicionário de variáveis** (`dictionary`): enunciado, tipo, códigos e rótulos, pontos (CCEB), unidade e faixa de cada coluna. Use junto com os CSVs.

### Importar na análise
```r
# R
dados <- read.csv2("faetec_all.csv", fileEncoding = "UTF-8-BOM")        # decimal vírgula (padrão)
dados <- read.csv2("faetec_all.csv", fileEncoding = "UTF-8-BOM", dec = ".")  # se exportou com ponto
```
```python
# Python
import pandas as pd
df = pd.read_csv("faetec_all.csv", sep=";", decimal=",", encoding="utf-8-sig")
```
SPSS / Stata / jamovi: importar texto delimitado, separador `;`, codificação UTF-8, decimal conforme exportado.

## Segurança (importante)
Sem login, a URL de teste não deve conter dados reais de alunos. Antes de coletar dados reais: autenticação, HTTPS, backups e revisão de LGPD/consentimento (são menores de idade).

## Decisões a conferir
- Q17.1 e Q19.1 só aparecem se Q17/Q19 ≠ “Nenhum dia”; Q14.1 e Q15.1 só se Q14/Q15 = “Sim”.
- Opções sem numeração no caderno (Q10, Q17.1, Q18.1, Q19.1) receberam códigos 1..n na ordem impressa; Q16 usa 1=Sim, 2=Não.
- Tabelas do CCEB usadas exatamente como no caderno.
- O banco usa `CreateTables` na 1ª execução; para evoluir o esquema depois, adotar migrations do EF Core.
- Banco criado pela versão anterior (com usuários) é incompatível: apague o volume/arquivo antes de subir.
