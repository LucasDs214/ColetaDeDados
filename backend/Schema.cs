using System.Globalization;
using System.Text.Json.Nodes;

/// Carrega shared/instruments.json: fonte única para validação, cálculo e exportação.
public class Schema
{
    public JsonArray Instruments { get; }
    public string RawJson { get; }

    public Schema(string path)
    {
        RawJson = File.ReadAllText(path);
        Instruments = JsonNode.Parse(RawJson)!["instruments"]!.AsArray();
    }

    public JsonNode? Get(string id) => Instruments.FirstOrDefault(i => i!["id"]!.GetValue<string>() == id);
    public static IEnumerable<JsonNode> Questions(JsonNode inst) =>
        inst["sections"]!.AsArray().SelectMany(s => s!["questions"]!.AsArray()).Select(q => q!);
    public static bool HasMoments(JsonNode inst) => inst["moments"]!.GetValue<bool>();

    public static double? Num(JsonNode? n)
    {
        if (n is not JsonValue v) return null;
        if (v.TryGetValue<double>(out var d)) return d;
        if (v.TryGetValue<int>(out var i)) return i;
        if (v.TryGetValue<long>(out var l)) return l;
        return null;
    }

    public static IEnumerable<double> Codes(JsonNode q) =>
        q["options"]!.AsArray().Select(o => o!["v"]!.GetValue<double>());

    /// Mantém apenas campos conhecidos, com tipo/faixa válidos. Retorna erros.
    public static (JsonObject clean, List<string> errors) Sanitize(JsonNode inst, JsonObject data)
    {
        var clean = new JsonObject();
        var errors = new List<string>();
        foreach (var q in Questions(inst))
        {
            var id = q["id"]!.GetValue<string>();
            if (!data.TryGetPropertyValue(id, out var v) || v is null) continue;
            switch (q["type"]!.GetValue<string>())
            {
                case "single":
                    if (Num(v) is double c && Codes(q).Contains(c)) clean[id] = JsonValue.Create((int)c);
                    else errors.Add($"{id}: opção inválida");
                    break;
                case "multi":
                    if (v is JsonArray arr && arr.All(x => Num(x) is double d && Codes(q).Contains(d)))
                        clean[id] = new JsonArray(arr.Select(x => (JsonNode)JsonValue.Create((int)Num(x)!.Value)!).ToArray());
                    else errors.Add($"{id}: opções inválidas");
                    break;
                case "number":
                    if (Num(v) is double n && n >= q["min"]!.GetValue<double>() && n <= q["max"]!.GetValue<double>()) clean[id] = JsonValue.Create(n);
                    else errors.Add($"{id}: valor fora da faixa ({q["min"]}–{q["max"]})");
                    break;
                case "date":
                    if (v is JsonValue dv && dv.TryGetValue<string>(out var s) && DateOnly.TryParseExact(s, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
                        clean[id] = JsonValue.Create(s);
                    else errors.Add($"{id}: data inválida");
                    break;
                case "meds":
                    if (v is JsonArray meds && meds.Count <= 5)
                    {
                        var outArr = new JsonArray();
                        foreach (var m in meds.OfType<JsonObject>())
                        {
                            var o = new JsonObject();
                            foreach (var k in new[] { "nome", "horario", "dose" })
                                if (m[k] is JsonValue kv && kv.TryGetValue<string>(out var ks) && ks.Length > 0) o[k] = JsonValue.Create(ks.Length > 200 ? ks[..200] : ks);
                            if (Num(m["prescricao"]) is double pr && (pr == 1 || pr == 2)) o["prescricao"] = JsonValue.Create((int)pr);
                            if (o.Count > 0) outArr.Add(o);
                        }
                        clean[id] = outArr;
                    }
                    else errors.Add($"{id}: máximo de 5 medicamentos");
                    break;
                default:
                    if (v is JsonValue tv && tv.TryGetValue<string>(out var t)) clean[id] = JsonValue.Create(t.Length > 500 ? t[..500] : t);
                    break;
            }
        }
        return (clean, errors);
    }

    /// Campos calculados (autoritativos no servidor).
    public static void Calculate(JsonNode inst, JsonObject d)
    {
        var instId = inst["id"]!.GetValue<string>();
        foreach (var c in inst["computed"]!.AsArray()) d.Remove(c!.GetValue<string>());

        if (instId == "i2")
        {
            var peso = Num(d["q24_peso_kg"]); var a1 = Num(d["q25_altura1_cm"]); var a2 = Num(d["q26_altura2_cm"]);
            if (a1 is double x && a2 is double y)
            {
                var media = (x + y) / 2; var dif = Math.Abs(x - y);
                d["altura_media_cm"] = Math.Round(media, 2);
                d["dif_altura_cm"] = Math.Round(dif, 2);
                d["alerta_altura"] = dif > 0.5 ? 1 : 0; // tolerância do caderno: 0,5 cm
                if (peso is double p) d["imc"] = Math.Round(p / Math.Pow(media / 100, 2), 2);
            }
        }
        else if (instId == "i6")
        {
            var sums = new Dictionary<string, int> { ["bens"] = 0, ["instrucao"] = 0, ["servicos"] = 0 };
            var complete = true;
            foreach (var q in Questions(inst).Where(q => q["group"] is not null))
            {
                var code = Num(d[q["id"]!.GetValue<string>()]);
                var opt = code is null ? null : q["options"]!.AsArray().FirstOrDefault(o => o!["v"]!.GetValue<double>() == code);
                if (opt is null) { complete = false; continue; }
                sums[q["group"]!.GetValue<string>()] += opt["points"]!.GetValue<int>();
            }
            if (!complete) return;
            var total = sums.Values.Sum();
            d["escore_bens"] = sums["bens"]; d["escore_instrucao"] = sums["instrucao"]; d["escore_servicos"] = sums["servicos"];
            d["escore_total"] = total;
            var cut = inst["cutoffs"]!.AsArray().FirstOrDefault(c => total >= c!["min"]!.GetValue<int>() && total <= c["max"]!.GetValue<int>());
            if (cut is not null) { d["classe_economica"] = cut["class"]!.GetValue<string>(); d["renda_media"] = cut["income"]!.GetValue<double>(); }
        }
    }
}
