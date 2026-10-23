using Microsoft.EntityFrameworkCore;

public class Participant
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Code { get; set; } = "";          // campo "ID" do caderno (Q5)
    public string School { get; set; } = "";        // Q1
    public string FullName { get; set; } = "";      // Q3 (identificável)
    public DateOnly? BirthDate { get; set; }        // Q4 (identificável)
    public string? Email { get; set; }              // identificável
    public string? GradeClass { get; set; }         // Q6
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<SurveyResponse> Responses { get; set; } = new();
}

public class SurveyResponse
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ParticipantId { get; set; }
    public Participant? Participant { get; set; }
    public string Instrument { get; set; } = "";    // i1 | i2 | i6
    public string Moment { get; set; } = "M1";      // M1 | M2 | M3
    public string Data { get; set; } = "{}";        // JSON: respostas + campos calculados
    public string Status { get; set; } = "draft";   // draft | complete
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class Db : DbContext
{
    public Db(DbContextOptions<Db> o) : base(o) { }
    public DbSet<Participant> Participants => Set<Participant>();
    public DbSet<SurveyResponse> Responses => Set<SurveyResponse>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Participant>().HasIndex(p => p.Code).IsUnique();
        if (Database.IsNpgsql()) b.Entity<SurveyResponse>().Property(r => r.Data).HasColumnType("jsonb"); // SQLite guarda como TEXT
        b.Entity<SurveyResponse>().HasIndex(r => new { r.ParticipantId, r.Instrument, r.Moment }).IsUnique();
        b.Entity<SurveyResponse>().HasOne(r => r.Participant).WithMany(p => p.Responses).HasForeignKey(r => r.ParticipantId).OnDelete(DeleteBehavior.Cascade);
    }
}

/// 20 alunos fictícios (IDs DEMO-001…DEMO-020), criados só na primeira criação do banco.
public static class Seed
{
    static readonly string[] Names =
    {
        "Ana Clara Souza", "Bruno Henrique Lima", "Camila Ferreira Costa", "Daniel Oliveira Santos", "Eduarda Martins Alves",
        "Felipe Araújo Ribeiro", "Gabriela Nascimento Rocha", "Heitor Barbosa Cardoso", "Isabela Moreira Dias", "João Pedro Carvalho",
        "Kauã Teixeira Gomes", "Larissa Mendes Pinto", "Mateus Correia Freitas", "Natália Cavalcanti Melo", "Otávio Ramos Vieira",
        "Paula Monteiro Castro", "Rafael Pereira Duarte", "Sofia Azevedo Lopes", "Thiago Batista Nunes", "Valentina Rezende Moura",
    };

    public static void Run(Db db)
    {
        var turmas = new[] { "1º ano · Turma 101", "1º ano · Turma 102", "2º ano · Turma 201", "2º ano · Turma 202", "3º ano · Turma 301" };
        for (var i = 0; i < Names.Length; i++)
        {
            db.Participants.Add(new Participant
            {
                Code = $"DEMO-{i + 1:000}",
                School = i % 2 == 0 ? "FAETEC · Unidade Piloto A" : "FAETEC · Unidade Piloto B",
                FullName = Names[i],
                BirthDate = new DateOnly(2008, 6, 10).AddDays(i * 55),
                GradeClass = turmas[i % turmas.Length],
                CreatedAt = DateTime.UtcNow.AddSeconds(-(Names.Length - i)),
            });
        }
        db.SaveChanges();
    }
}
