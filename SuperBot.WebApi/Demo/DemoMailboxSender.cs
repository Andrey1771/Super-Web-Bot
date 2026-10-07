using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.WebApi.Mail;

namespace SuperBot.WebApi.Demo;

/// <summary>
/// Почта демо-сайта: письма не уходят наружу, а ложатся в «демо-почту» той копии, из которой их отправили
/// (база песочницы выбирается сама, по метке запроса). Посетитель видит письмо с ключом после покупки,
/// подтверждение адреса и прочее прямо на сайте, а чужие адреса, введённые на кассе, ничего не получают.
/// </summary>
public sealed class DemoMailboxSender(IMongoDatabase database) : IMailSender
{
    public Task SendAsync(string to, string subject, string textBody, string? htmlBody = null, CancellationToken cancellationToken = default) =>
        database.GetCollection<BsonDocument>(DemoSandboxService.MailboxCollection).InsertOneAsync(new BsonDocument
        {
            { "to", to },
            { "subject", subject },
            { "text", textBody },
            { "html", htmlBody is null ? BsonNull.Value : htmlBody },
            { "sentAt", DateTime.UtcNow },
        }, cancellationToken: cancellationToken);
}
