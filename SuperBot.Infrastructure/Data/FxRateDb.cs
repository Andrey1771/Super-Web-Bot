using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data;

/// <summary>
/// Курс валюты на момент снимка. Коллекция «только на добавление»: каждый принятый курс
/// остаётся навсегда, актуальным считается последний по <see cref="CapturedAtUtc"/>.
///
/// История нужна не для красоты: когда покупатель спорит о цене, вопрос звучит «по какому курсу
/// вы это посчитали в прошлый вторник», и ответить на него можно только записью. Она же
/// показывает, что именно сделал гард, когда отклонил импорт.
/// </summary>
public class FxRateDb
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    /// <summary>Базовая валюта каталога на момент снимка.</summary>
    [BsonElement("from")]
    public string From { get; set; } = string.Empty;

    /// <summary>Валюта, в которую пересчитываем.</summary>
    [BsonElement("to")]
    public string To { get; set; } = string.Empty;

    /// <summary>Сколько единиц <see cref="To"/> даёт одна единица <see cref="From"/>.</summary>
    [BsonElement("rate")]
    public decimal Rate { get; set; }

    [BsonElement("capturedAt")]
    public DateTime CapturedAtUtc { get; set; }
}
