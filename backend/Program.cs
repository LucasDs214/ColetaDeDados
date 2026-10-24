using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Storage;

// Site (React compilado) em <pasta do app>/wwwroot, independente do diretório de trabalho do container
var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = AppContext.BaseDirectory,
    WebRootPath = Path.Combine(AppContext.BaseDirectory, "wwwroot"),
});
var cfg = builder.Configuration;

// Banco configurável: "sqlite" (testes locais) ou "postgres" (Supabase / Postgres comum).
// O tipo é detectado pela própria string de conexão, então Database__Provider é opcional.
var provider = (cfg["Database:Provider"] ?? "sqlite").Trim().ToLower();
var conn = (cfg.GetConnectionString("Default") ?? throw new Exception("ConnectionStrings:Default não configurada")).Trim().Trim('"', '\'').Trim();
if (conn.StartsWith("postgres", StringComparison.OrdinalIgnoreCase) || conn.Contains("Host=", StringComparison.OrdinalIgnoreCase)) provider = "postgres";
if (provider == "postgres") conn = NormalizePg(conn);
if (provider == "sqlite")
{
    var file = new Microsoft.Data.Sqlite.SqliteConnectionStringBuilder(conn).DataSource;
    Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(file))!);
}
else if (provider != "postgres") throw new Exception("Database:Provider deve ser 'sqlite' ou 'postgres'");
Console.WriteLine($"Banco: {provider}");

builder.Services.AddDbContext<Db>(o => { if (provider == "postgres") o.UseNpgsql(conn); else o.UseSqlite(conn); });
builder.Services.AddSingleton(new Schema(Path.Combine(AppContext.BaseDirectory, "instruments.json")));

var app = builder.Build();

// ---- Banco: cria as tabelas se ainda não existirem (+ alunos de demonstração na 1ª vez) ----
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<Db>();
    var creator = db.GetService<IRelationalDatabaseCreator>();
    var created = false;
    for (var attempt = 1; ; attempt++)
    {
        try
        {
            created = false;
            try { _ = db.Participants.Any(); }
            catch { creator.CreateTables(); created = true; }   // não usa EnsureCreated: no Supabase ele ignora o schema "public" por já haver outras tabelas
            break;
        }
        catch when (attempt < 15) { Thread.Sleep(2000); }
    }
    if (provider == "postgres")
    {
        // Supabase expõe o schema "public" via API REST: ativa RLS (sem políticas) para negar acesso por essa via.
        // A API C# conecta com o papel postgres, que ignora RLS.
        foreach (var t in new[] { "Participants", "Responses" })
            db.Database.ExecuteSqlRaw($"ALTER TABLE \"{t}\" ENABLE ROW LEVEL SECURITY");
    }
    if (created && cfg.GetValue("SEED_DEMO", true)) Seed.Run(db);
}

// ---- Trava de acesso opcional (não é login): senha única para quem abrir a URL pública ----
// Ative definindo ACCESS_PASSWORD (e, se quiser, ACCESS_USER). O navegador mostra a caixa de senha nativa.
var gatePass = cfg["ACCESS_PASSWORD"];
if (!string.IsNullOrEmpty(gatePass))
{
    var expected = Encoding.UTF8.GetBytes($"{(string.IsNullOrEmpty(cfg["ACCESS_USER"]) ? "faetec" : cfg["ACCESS_USER"])}:{gatePass}");
    app.Use(async (ctx, next) =>
    {
        if (ctx.Request.Path.StartsWithSegments("/api/health")) { await next(); return; }
        var h = ctx.Request.Headers.Authorization.ToString();
        if (h.StartsWith("Basic ", StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                if (CryptographicOperations.FixedTimeEquals(Convert.FromBase64String(h[6..].Trim()), expected)) { await next(); return; }
            }
            catch (FormatException) { }
        }
        ctx.Response.StatusCode = 401;
        ctx.Response.Headers.WWWAuthenticate = "Basic realm=\"FAETEC Coleta\", charset=\"UTF-8\"";
    });
}

// Site (React compilado) servido pela própria API: um único serviço/URL
app.UseDefaultFiles();
app.UseStaticFiles();

static DateTime Utc(DateTime d) => DateTime.SpecifyKind(d, DateTimeKind.Utc);

var api = app.MapGroup("/api");
api.MapGet("/health", () => Results.Ok(new { ok = true, banco = provider, site = File.Exists(Path.Combine(AppContext.BaseDirectory, "wwwroot", "index.html")) }));
api.MapGet("/schema", (Schema s) => Results.Content(s.RawJson, "application/json"));

// ---- Painel ----
api.MapGet("/stats", async (Db db, Schema schema) =>
{
    var total = await db.Participants.CountAsync();
    var rs = await db.Responses.Select(r => new { r.Instrument, r.Moment, r.Status, r.UpdatedAt }).ToListAsync();
    var cards = new List<object>();
    foreach (var inst in schema.Instruments)
    {
        var id = inst!["id"]!.GetValue<string>();
        foreach (var m in Schema.HasMoments(inst) ? new[] { "M1", "M2", "M3" } : new[] { "M1" })
            cards.Add(new
            {
                instrument = id, moment = m,
                complete = rs.Count(r => r.Instrument == id && r.Moment == m && r.Status == "complete"),
                draft = rs.Count(r => r.Instrument == id && r.Moment == m && r.Status == "draft"),
            });
    }
    var today = DateTime.UtcNow.Date;
    var thisWeek = today.AddDays(-(((int)today.DayOfWeek + 6) % 7)); // segunda-feira
    var weekly = Enumerable.Range(0, 8).Select(i => thisWeek.AddDays(-7 * (7 - i))).Select(w => new
    {
        weekStart = w.ToString("yyyy-MM-dd"),
        count = rs.Count(r => r.UpdatedAt >= w && r.UpdatedAt < w.AddDays(7)),
    }).ToList();
    var recent = (await db.Responses.OrderByDescending(r => r.UpdatedAt).Take(6)
        .Select(r => new { r.Instrument, r.Moment, r.Status, r.UpdatedAt, r.ParticipantId, name = r.Participant!.FullName, code = r.Participant.Code })
        .ToListAsync()).Select(r => new { r.Instrument, r.Moment, r.Status, updatedAt = Utc(r.UpdatedAt), r.ParticipantId, r.name, r.code });
    return Results.Ok(new { total, cards, weekly, recent });
});

// ---- Participantes ----
api.MapGet("/participants", async (Db db, string? q) =>
{
    var query = db.Participants.AsQueryable();
    if (!string.IsNullOrWhiteSpace(q))
    {
        var s = q.Trim().ToLower();
        query = query.Where(p => p.Code.ToLower().Contains(s) || p.FullName.ToLower().Contains(s));
    }
    var list = await query.OrderBy(p => p.Code).Take(2000).Select(p => new
    {
        p.Id, p.Code, p.School, p.FullName, p.GradeClass,
        responses = p.Responses.Select(r => new { r.Instrument, r.Moment, r.Status }).ToList(),
    }).ToListAsync();
    return Results.Ok(list);
});

api.MapPost("/participants", async (ParticipantDto dto, Db db) =>
{
    var err = Validate(dto); if (err is not null) return Results.BadRequest(new { error = err });
    if (await db.Participants.AnyAsync(p => p.Code == dto.Code.Trim())) return Results.Conflict(new { error = "Já existe participante com este ID" });
    var p = new Participant();
    Apply(p, dto);
    db.Participants.Add(p); await db.SaveChangesAsync();
    return Results.Ok(new { p.Id });
});

api.MapGet("/participants/{id:guid}", async (Guid id, Db db) =>
{
    var p = await db.Participants.Include(x => x.Responses).FirstOrDefaultAsync(x => x.Id == id);
    if (p is null) return Results.NotFound();
    return Results.Ok(new
    {
        p.Id, p.Code, p.School, p.FullName, birthDate = p.BirthDate?.ToString("yyyy-MM-dd"), p.Email, p.GradeClass,
        responses = p.Responses.Select(r => new { r.Instrument, r.Moment, r.Status, data = JsonNode.Parse(r.Data), updatedAt = Utc(r.UpdatedAt) }),
    });
});

api.MapPut("/participants/{id:guid}", async (Guid id, ParticipantDto dto, Db db) =>
{
    var p = await db.Participants.FindAsync(id);
    if (p is null) return Results.NotFound();
    var err = Validate(dto); if (err is not null) return Results.BadRequest(new { error = err });
    if (await db.Participants.AnyAsync(x => x.Code == dto.Code.Trim() && x.Id != id)) return Results.Conflict(new { error = "Já existe participante com este ID" });
    Apply(p, dto); await db.SaveChangesAsync();
    return Results.Ok(new { p.Id });
});

api.MapDelete("/participants/{id:guid}", async (Guid id, Db db) =>
{
    var p = await db.Participants.FindAsync(id);
    if (p is null) return Results.NotFound();
    db.Participants.Remove(p); await db.SaveChangesAsync();
    return Results.NoContent();
});

// ---- Respostas (upsert por participante × instrumento × momento) ----
api.MapPut("/participants/{id:guid}/responses/{instrument}/{moment}", async (Guid id, string instrument, string moment, ResponseDto dto, Db db, Schema schema) =>
{
    if (!await db.Participants.AnyAsync(p => p.Id == id)) return Results.NotFound();
    var inst = schema.Get(instrument);
    if (inst is null) return Results.NotFound(new { error = "Instrumento inexistente" });
    var allowed = Schema.HasMoments(inst) ? new[] { "M1", "M2", "M3" } : new[] { "M1" };
    if (!allowed.Contains(moment)) return Results.BadRequest(new { error = "Momento inválido" });
    if (dto.Status is not ("draft" or "complete")) return Results.BadRequest(new { error = "Status inválido" });

    var (clean, errors) = Schema.Sanitize(inst, dto.Data ?? new JsonObject());
    if (errors.Count > 0) return Results.BadRequest(new { error = string.Join("; ", errors) });
    Schema.Calculate(inst, clean);

    var r = await db.Responses.FirstOrDefaultAsync(x => x.ParticipantId == id && x.Instrument == instrument && x.Moment == moment);
    if (r is null) { r = new SurveyResponse { ParticipantId = id, Instrument = instrument, Moment = moment }; db.Responses.Add(r); }
    r.Data = clean.ToJsonString(); r.Status = dto.Status; r.UpdatedAt = DateTime.UtcNow;
    await db.SaveChangesAsync();
    return Results.Ok(new { r.Instrument, r.Moment, r.Status, data = JsonNode.Parse(r.Data) });
});

// ---- Exportação CSV ----
api.MapGet("/export/{what}.csv", async (string what, bool? labels, bool? identified, HttpRequest req, Db db, Schema schema) =>
{
    var list = await db.Participants.Include(p => p.Responses).OrderBy(p => p.Code).ToListAsync();
    var comma = (req.Query["decimal"].FirstOrDefault() ?? "comma") != "point";
    var ident = identified ?? false;
    var bytes = Exporter.Build(list, schema, what, new Exporter.Opts(labels ?? false, ident, comma));
    if (bytes is null) return Results.NotFound();
    return Results.File(bytes, "text/csv; charset=utf-8", $"faetec_{what}_{DateTime.Now:yyyyMMdd_HHmm}{(ident ? "_identificado" : "")}.csv");
});

app.MapFallbackToFile("index.html");

app.Run();

/// Aceita a string no formato Npgsql ("Host=...;...") ou a URI que o Supabase mostra ("postgresql://usuario:senha@host:5432/postgres").
static string NormalizePg(string c)
{
    if (!c.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) && !c.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase)) return c;
    var u = new Uri(c);
    var ui = u.UserInfo.Split(':', 2);
    var db = u.AbsolutePath.Trim('/');
    return new Npgsql.NpgsqlConnectionStringBuilder
    {
        Host = u.Host, Port = u.Port > 0 ? u.Port : 5432, Database = db.Length > 0 ? db : "postgres",
        Username = Uri.UnescapeDataString(ui[0]), Password = ui.Length > 1 ? Uri.UnescapeDataString(ui[1]) : "",
        SslMode = Npgsql.SslMode.Require, TrustServerCertificate = true,
    }.ConnectionString;
}

static string? Validate(ParticipantDto d)
{
    if (string.IsNullOrWhiteSpace(d.Code)) return "ID do participante é obrigatório";
    if (string.IsNullOrWhiteSpace(d.School)) return "Unidade escolar é obrigatória";
    if (string.IsNullOrWhiteSpace(d.FullName)) return "Nome completo é obrigatório";
    if (!string.IsNullOrWhiteSpace(d.BirthDate) && !DateOnly.TryParseExact(d.BirthDate, "yyyy-MM-dd", out _)) return "Data de nascimento inválida";
    return null;
}
static void Apply(Participant p, ParticipantDto d)
{
    p.Code = d.Code.Trim(); p.School = d.School.Trim(); p.FullName = d.FullName.Trim();
    p.BirthDate = string.IsNullOrWhiteSpace(d.BirthDate) ? null : DateOnly.ParseExact(d.BirthDate, "yyyy-MM-dd");
    p.Email = string.IsNullOrWhiteSpace(d.Email) ? null : d.Email.Trim();
    p.GradeClass = string.IsNullOrWhiteSpace(d.GradeClass) ? null : d.GradeClass.Trim();
}

record ParticipantDto(string Code, string School, string FullName, string? BirthDate, string? Email, string? GradeClass);
record ResponseDto(string Status, JsonObject? Data);