using System.Globalization;
using System.Text;
using System.Text.Json.Nodes;

/// Exportação CSV: separador ';', UTF-8 com BOM, decimal vírgula por padrão (compatível com Excel pt-BR e read.csv2 do R).
public static class Exporter
{
    const int MaxMeds = 5;
    static readonly string[] MedFields = { "nome", "horario", "dose", "prescricao" };

    public record Opts(bool Labels, bool Identified, bool Comma);

    static string Esc(string? s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        return s.IndexOfAny(new[] { ';', '"', '\n', '\r' }) >= 0 ? "\"" + s.Replace("\"", "\"\"") + "\"" : s;
    }

    static string Fmt(double d, Opts o) =>
        d.ToString("0.##########", o.Comma ? new CultureInfo("pt-BR") : CultureInfo.InvariantCulture);

    static string Label(JsonNode q, double code) =>
        q["options"]!.AsArray().First(x => x!["v"]!.GetValue<double>() == code)!["l"]!.GetValue<string>();

    /// Colunas de um instrumento (na ordem do caderno).
    public static List<string> InstrumentColumns(JsonNode inst)
    {
        var id = inst["id"]!.GetValue<string>();
        var cols = new List<string>();
        foreach (var q in Schema.Questions(inst))
        {
            var qid = q["id"]!.GetValue<string>();
            switch (q["type"]!.GetValue<string>())
            {
                case "multi": cols.AddRange(q["options"]!.AsArray().Select(o => $"{qid}__{o!["v"]}")); break;
                case "meds":
                    cols.Add($"{qid}_n");
                    for (var i = 1; i <= MaxMeds; i++) cols.AddRange(MedFields.Select(f => $"{qid}_{i}_{f}"));
                    break;
                default: cols.Add(qid); break;
            }
        }
        cols.AddRange(inst["computed"]!.AsArray().Select(c => c!.GetValue<string>()));
        cols.Add($"{id}_status");
        return cols;
    }

    static Dictionary<string, string> Flatten(JsonNode inst, JsonObject d, string status, Opts o)
    {
        var row = new Dictionary<string, string>();
        foreach (var q in Schema.Questions(inst))
        {
            var qid = q["id"]!.GetValue<string>();
            var v = d[qid];
            switch (q["type"]!.GetValue<string>())
            {
                case "single":
                    if (Schema.Num(v) is double c) row[qid] = o.Labels ? Label(q, c) : Fmt(c, o);
                    break;
                case "multi":
                    var sel = (v as JsonArray)?.Select(x => Schema.Num(x)).Where(x => x != null).Select(x => x!.Value).ToHashSet() ?? new HashSet<double>();
                    if (v is not null || d.Count > 0)
                        foreach (var opt in q["options"]!.AsArray()) row[$"{qid}__{opt!["v"]}"] = sel.Contains(opt["v"]!.GetValue<double>()) ? "1" : "0";
                    break;
                case "meds":
                    var meds = (v as JsonArray)?.OfType<JsonObject>().ToList() ?? new();
                    if (d["q16_medicamento_continuo"] is not null) row[$"{qid}_n"] = meds.Count.ToString();
                    for (var i = 0; i < Math.Min(meds.Count, MaxMeds); i++)
                        foreach (var f in MedFields)
                        {
                            var fv = meds[i][f];
                            if (fv is null) continue;
                            row[$"{qid}_{i + 1}_{f}"] = f == "prescricao" ? (o.Labels ? (Schema.Num(fv) == 1 ? "Sim" : "Não") : Fmt(Schema.Num(fv) ?? 0, o)) : fv.GetValue<string>();
                        }
                    break;
                case "number":
                    if (Schema.Num(v) is double n) row[qid] = Fmt(n, o);
                    break;
                default:
                    if (v is JsonValue sv && sv.TryGetValue<string>(out var s)) row[qid] = s;
                    break;
            }
        }
        foreach (var c in inst["computed"]!.AsArray())
        {
            var cid = c!.GetValue<string>();
            var v = d[cid];
            if (v is null) continue;
            row[cid] = Schema.Num(v) is double n ? Fmt(n, o) : v.GetValue<string>();
        }
        row[$"{inst["id"]!.GetValue<string>()}_status"] = status;
        return row;
    }

    static List<string> MetaColumns(Opts o)
    {
        var l = new List<string> { "codigo", "escola", "serie_turma" };
        if (o.Identified) l.AddRange(new[] { "nome", "data_nascimento", "email" });
        l.AddRange(new[] { "idade_anos", "momento" });
        return l;
    }

    static string Age(Participant p, string? collectionDate, Opts o)
    {
        if (p.BirthDate is null || collectionDate is null || !DateOnly.TryParseExact(collectionDate, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var dt)) return "";
        return Fmt(Math.Round((dt.ToDateTime(TimeOnly.MinValue) - p.BirthDate.Value.ToDateTime(TimeOnly.MinValue)).TotalDays / 365.25, 2), o);
    }

    static Dictionary<string, string> Meta(Participant p, string moment, string? collectionDate, Opts o)
    {
        var m = new Dictionary<string, string>
        {
            ["codigo"] = p.Code, ["escola"] = p.School, ["serie_turma"] = p.GradeClass ?? "",
            ["idade_anos"] = Age(p, collectionDate, o), ["momento"] = moment,
        };
        if (o.Identified)
        {
            m["nome"] = p.FullName; m["email"] = p.Email ?? "";
            m["data_nascimento"] = p.BirthDate?.ToString("yyyy-MM-dd") ?? "";
        }
        return m;
    }

    static byte[] ToCsv(List<string> cols, IEnumerable<Dictionary<string, string>> rows)
    {
        var sb = new StringBuilder();
        sb.Append(string.Join(';', cols)).Append("\r\n");
        foreach (var r in rows) sb.Append(string.Join(';', cols.Select(c => Esc(r.TryGetValue(c, out var v) ? v : "")))).Append("\r\n");
        return new UTF8Encoding(true).GetPreamble().Concat(Encoding.UTF8.GetBytes(sb.ToString())).ToArray();
    }

    static readonly Dictionary<string, (string Text, string Tipo, string Unit)> Computed = new()
    {
        ["altura_media_cm"] = ("Média das duas aferições de altura", "numérica", "cm"),
        ["dif_altura_cm"] = ("Diferença absoluta entre as duas alturas", "numérica", "cm"),
        ["imc"] = ("Índice de massa corporal (peso / altura²)", "numérica", "kg/m²"),
        ["alerta_altura"] = ("Alerta: 1 = diferença entre as alturas maior que 0,5 cm", "binária (0/1)", ""),
        ["escore_bens"] = ("CCEB — pontos de posse de bens", "numérica", "pontos"),
        ["escore_instrucao"] = ("CCEB — pontos de instrução do chefe da família", "numérica", "pontos"),
        ["escore_servicos"] = ("CCEB — pontos de serviços públicos", "numérica", "pontos"),
        ["escore_total"] = ("CCEB — escore total (0 a 100)", "numérica", "pontos"),
        ["classe_economica"] = ("CCEB — classe econômica (A, B1, B2, C1, C2, DE)", "categórica", ""),
        ["renda_media"] = ("CCEB — renda média domiciliar estimada da classe", "numérica", "R$"),
    };

    /// Dicionário de variáveis (codebook): uma linha por variável (ou por opção de resposta).
    static byte[] Codebook(Schema schema, Opts o)
    {
        var cols = new List<string> { "instrumento", "variavel", "questao", "enunciado", "tipo", "codigo", "rotulo", "pontos", "unidade", "minimo", "maximo", "referencia" };
        var rows = new List<Dictionary<string, string>>();
        void Add(string inst, string v, string num, string text, string tipo, string cod = "", string rot = "", string pts = "", string un = "", string mi = "", string ma = "", string rf = "") =>
            rows.Add(new()
            {
                ["instrumento"] = inst, ["variavel"] = v, ["questao"] = num, ["enunciado"] = text, ["tipo"] = tipo, ["codigo"] = cod,
                ["rotulo"] = rot, ["pontos"] = pts, ["unidade"] = un, ["minimo"] = mi, ["maximo"] = ma, ["referencia"] = rf,
            });

        Add("cadastro", "codigo", "5", "ID do participante", "texto");
        Add("cadastro", "escola", "1", "Unidade escolar", "texto");
        Add("cadastro", "serie_turma", "6", "Série / turma", "texto");
        Add("cadastro", "idade_anos", "", "Idade na data da coleta (decimal)", "numérica", un: "anos");
        Add("cadastro", "momento", "", "Momento da coleta (instrumentos de linha de base ficam em M1)", "categórica", "M1 / M2 / M3");

        foreach (var inst in schema.Instruments.Select(i => i!))
        {
            var iid = inst["id"]!.GetValue<string>();
            foreach (var q in Schema.Questions(inst))
            {
                var qid = q["id"]!.GetValue<string>();
                var num = q["num"]?.GetValue<string>() ?? "";
                var text = q["label"]!.GetValue<string>();
                var rf = q["ref"]?.GetValue<string>() ?? "";
                switch (q["type"]!.GetValue<string>())
                {
                    case "single":
                        foreach (var opt in q["options"]!.AsArray())
                            Add(iid, qid, num, text, "categórica", Fmt(opt!["v"]!.GetValue<double>(), o), opt["l"]!.GetValue<string>(),
                                opt["points"] is null ? "" : opt["points"]!.GetValue<int>().ToString(), rf: rf);
                        break;
                    case "multi":
                        foreach (var opt in q["options"]!.AsArray())
                            Add(iid, $"{qid}__{opt!["v"]}", num, $"{text} — {opt["l"]!.GetValue<string>()}", "binária (0/1)", "0 / 1", "0 = não marcou; 1 = marcou", rf: rf);
                        break;
                    case "meds":
                        Add(iid, $"{qid}_n", num, "Quantidade de medicamentos informados", "numérica");
                        foreach (var f in MedFields)
                            Add(iid, $"{qid}_<1-{MaxMeds}>_{f}", num, $"Medicamento (1 a {MaxMeds}) — {f}", f == "prescricao" ? "categórica" : "texto",
                                f == "prescricao" ? "1 / 2" : "", f == "prescricao" ? "1 = Sim; 2 = Não" : "");
                        break;
                    case "number":
                        Add(iid, qid, num, text, "numérica", un: q["unit"]?.GetValue<string>() ?? "",
                            mi: q["min"] is null ? "" : Fmt(q["min"]!.GetValue<double>(), o), ma: q["max"] is null ? "" : Fmt(q["max"]!.GetValue<double>(), o), rf: rf);
                        break;
                    case "date": Add(iid, qid, num, text, "data (AAAA-MM-DD)", rf: rf); break;
                    default: Add(iid, qid, num, text, "texto", rf: rf); break;
                }
            }
            foreach (var c in inst["computed"]!.AsArray())
            {
                var cid = c!.GetValue<string>();
                if (Computed.TryGetValue(cid, out var cd)) Add(iid, cid, "", cd.Text, cd.Tipo, un: cd.Unit);
            }
            Add(iid, $"{iid}_status", "", "Situação do preenchimento", "categórica", "draft / complete", "draft = rascunho; complete = finalizado");
        }
        return ToCsv(cols, rows);
    }

    /// what: "participants" | "i1" | "i2" | "i6" | "all"
    public static byte[]? Build(IReadOnlyList<Participant> participants, Schema schema, string what, Opts o)
    {
        if (what == "dictionary") return Codebook(schema, o);

        if (what == "participants")
        {
            var cols = new List<string> { "codigo", "escola", "serie_turma" };
            if (o.Identified) cols.AddRange(new[] { "nome", "data_nascimento", "email" });
            cols.Add("criado_em");
            return ToCsv(cols, participants.Select(p =>
            {
                var m = Meta(p, "", null, o);
                m["criado_em"] = p.CreatedAt.ToString("yyyy-MM-dd HH:mm:ss");
                return m;
            }));
        }

        if (what == "all")
        {
            var insts = schema.Instruments.Select(i => i!).ToList();
            var cols = MetaColumns(o).Concat(insts.SelectMany(InstrumentColumns)).ToList();
            var rows = new List<Dictionary<string, string>>();
            foreach (var p in participants)
            {
                // linha por participante × momento; instrumentos de linha de base entram em M1
                foreach (var moment in p.Responses.Select(r => r.Moment).Append("M1").Distinct().OrderBy(x => x))
                {
                    var row = new Dictionary<string, string>();
                    string? coll = null;
                    var any = false;
                    foreach (var inst in insts)
                    {
                        var iid = inst["id"]!.GetValue<string>();
                        var r = p.Responses.FirstOrDefault(x => x.Instrument == iid && (Schema.HasMoments(inst) ? x.Moment == moment : moment == "M1"));
                        if (r is null) continue;
                        any = true;
                        var d = JsonNode.Parse(r.Data)!.AsObject();
                        coll ??= d[$"{iid}_data_coleta"]?.GetValue<string>();
                        foreach (var kv in Flatten(inst, d, r.Status, o)) row[kv.Key] = kv.Value;
                    }
                    if (!any) continue;
                    foreach (var kv in Meta(p, moment, coll, o)) row[kv.Key] = kv.Value;
                    rows.Add(row);
                }
            }
            return ToCsv(cols, rows);
        }

        var one = schema.Get(what);
        if (one is null) return null;
        {
            var cols = MetaColumns(o).Concat(InstrumentColumns(one)).ToList();
            var rows = participants.SelectMany(p => p.Responses.Where(r => r.Instrument == what).Select(r =>
            {
                var d = JsonNode.Parse(r.Data)!.AsObject();
                var row = Flatten(one, d, r.Status, o);
                foreach (var kv in Meta(p, r.Moment, d[$"{what}_data_coleta"]?.GetValue<string>(), o)) row[kv.Key] = kv.Value;
                return row;
            }));
            return ToCsv(cols, rows);
        }
    }
}
