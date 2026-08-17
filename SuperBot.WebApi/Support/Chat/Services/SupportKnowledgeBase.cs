using System.Globalization;

namespace SuperBot.WebApi.Support.Chat.Services;

/// <summary>
/// A dependency-free, offline-friendly knowledge base used to ground the AI support agent.
/// The content mirrors the customer-facing support docs (tale-gameshop/src/content/support/docs.ts)
/// so the assistant answers from Tale Shop's real policies instead of guessing.
/// Retrieval is a lightweight keyword/term-overlap scorer — no embeddings, no external services,
/// which keeps it fully local alongside Ollama.
/// </summary>
public interface ISupportKnowledgeBase
{
    /// <summary>
    /// Собирает блок с самыми подходящими статьями для подмешивания в запрос модели.
    /// <paramref name="maxArticleChars"/> ограничивает длину статьи; 0 — не обрезать.
    /// </summary>
    Task<string> BuildContextBlockAsync(string query, int limit, int maxArticleChars = 0);
}

public record KnowledgeArticle(
    string Id,
    string Title,
    string Category,
    IReadOnlyList<string> Keywords,
    string Content);

public class SupportKnowledgeBase : ISupportKnowledgeBase
{
    // Common words that carry no retrieval signal — ignored when scoring.
    private static readonly HashSet<string> StopWords = new(StringComparer.OrdinalIgnoreCase)
    {
        "the", "a", "an", "and", "or", "to", "of", "for", "in", "on", "is", "are", "my", "i",
        "how", "do", "can", "you", "with", "it", "this", "that", "please", "need", "help",
        "want", "get", "have", "me", "your", "we", "will", "at", "be", "was"
    };

    /// <summary>Исходные данные для первичного переноса в базу. В рантайме не используются.</summary>
    internal static readonly IReadOnlyList<KnowledgeArticle> SeedArticles = new List<KnowledgeArticle>
    {
        new(
            Id: "about",
            Title: "About Tale Shop",
            Category: "General",
            Keywords: new[] { "tale", "shop", "store", "who", "what", "games", "keys", "digital", "platform", "steam", "epic" },
            Content:
                "Tale Shop is a digital game store. Customers buy game keys/codes for platforms such as Steam, " +
                "Epic Games, EA App and Ubisoft Connect, then redeem them on the platform. Products, prices and " +
                "region/platform details are shown on each product page. Support topics: order status, payment & " +
                "checkout, key delivery/activation, refunds, product questions, account & security, technical issues."),

        new(
            Id: "activation-guide",
            Title: "Activation guide",
            Category: "Key delivery / activation",
            Keywords: new[] { "activate", "activation", "redeem", "key", "code", "steam", "epic", "ea", "ubisoft", "library", "launcher", "product" },
            Content:
                "Redeeming a key takes a couple of minutes. Keep the order number handy in case anything goes wrong.\n" +
                "Steam: open Steam, go to Games -> Activate a Product on Steam, enter the key exactly as shown and confirm. " +
                "If a region warning appears, check Regional restrictions before retrying.\n" +
                "Other platforms (Epic, EA, Ubisoft): open the platform's official redeem page, sign in, enter the key, then " +
                "restart the launcher to see the game in the library.\n" +
                "Security: a key is private — anyone who sees it can activate it. Never share screenshots of a revealed key, " +
                "not even with people claiming to be Tale Shop support."),

        new(
            Id: "refund-policy",
            Title: "Refund policy",
            Category: "Refund request",
            Keywords: new[] { "refund", "refunds", "money", "back", "return", "cancel", "chargeback", "revealed", "unrevealed", "eligible", "eligibility" },
            Content:
                "Refund basics: unrevealed keys are generally eligible for a refund. Revealed or activated keys are typically " +
                "non-refundable, because we can no longer verify they haven't been activated. Some products have extra " +
                "publisher restrictions.\n" +
                "How to request: go to Account -> Orders, open the order, select 'Request refund' and give a short reason. " +
                "We email you once the request is reviewed.\n" +
                "Processing time: most requests are reviewed within 24-48 hours. Approved refunds go back to the original " +
                "payment method; bank processing can take 3-10 business days."),

        new(
            Id: "payment-methods",
            Title: "Payment methods & checkout",
            Category: "Payment & checkout",
            Keywords: new[] { "payment", "pay", "card", "visa", "mastercard", "amex", "checkout", "failed", "declined", "billing", "3d", "secure", "transfer", "bank" },
            Content:
                "Supported options: major debit/credit cards (Visa, Mastercard, AMEX), select local payment options where " +
                "available, and bank transfers for selected regions.\n" +
                "Checkout tips: match the billing address to your bank records, use a stable connection to avoid timeouts, " +
                "and if a payment fails wait a few minutes before retrying.\n" +
                "Security: payments are encrypted and processed securely, we never store full card numbers on our servers, " +
                "and you should enable 3D Secure / bank verification when prompted. Repeated failures are usually a bank-side " +
                "decline — the customer should contact their bank or try another card."),

        new(
            Id: "regional-restrictions",
            Title: "Regional restrictions",
            Category: "Key delivery / activation",
            Keywords: new[] { "region", "regional", "restriction", "country", "locked", "activate", "error", "lock", "publisher" },
            Content:
                "Publishers can lock keys to specific regions because pricing and licensing rules differ by country. Region " +
                "details are shown on every product page.\n" +
                "How to check: compare the product region with the account country and the platform store region before " +
                "redeeming. If unsure, contact support BEFORE revealing the key.\n" +
                "If you see a region error: do not keep retrying (errors can temporarily lock the key), take a screenshot of " +
                "the error, and support can verify the region and advise next steps."),

        new(
            Id: "account-recovery",
            Title: "Account recovery & 2FA",
            Category: "Account & security",
            Keywords: new[] { "account", "recovery", "2fa", "two-factor", "authenticator", "backup", "codes", "locked", "login", "sign", "password", "hacked", "access", "security" },
            Content:
                "Self-service first: use a one-time backup code on the sign-in page ('Try another way' -> 'Recovery " +
                "authentication codes'); if still signed in on another device, re-configure 2FA under Account -> Security; " +
                "restoring the authenticator app from its own backup often brings codes back.\n" +
                "If nothing works: submit the recovery form at /account-recovery (works without signing in) with account " +
                "email, one or two recent order numbers, and the last 4 digits of the card used. Ownership is verified against " +
                "order and payment history, and recovery includes a waiting period of up to 72 hours for safety.\n" +
                "IMPORTANT SECURITY RULE: Support NEVER disables 2FA instantly, and NEVER asks for a password, a full card " +
                "number, or authenticator codes. Recovery is only handled by email, never in live chat or social media. If " +
                "anyone claiming to be Tale Shop asks for those, it is a scam."),

        new(
            Id: "order-status",
            Title: "Order status & key delivery",
            Category: "Order status",
            Keywords: new[] { "order", "status", "where", "delivery", "delivered", "pending", "processing", "email", "receipt", "missing", "key" },
            Content:
                "Orders and delivered keys are available in Account -> Orders. Most keys are delivered instantly after a " +
                "successful payment. If an order is still processing, payment confirmation from the bank can take a few " +
                "minutes. If a paid order shows no key after that, or the confirmation email is missing, ask the customer for " +
                "their order ID and account email so a specialist can look it up."),

        new(
            Id: "newsletter",
            Title: "Newsletter & deal alerts",
            Category: "Account & preferences",
            Keywords: new[] { "newsletter", "subscribe", "subscription", "unsubscribe", "emails", "spam", "deals", "alerts", "notify", "mailing", "list", "opt" },
            Content:
                "Tale Shop sends an occasional email newsletter with new deals and store news. Subscribing: enter an email " +
                "on the Deals page or the home page, then confirm via the link we email (double opt-in). Signed-in customers " +
                "can simply enable 'Deals newsletter' in Account -> Settings -> Notifications — no confirmation email needed.\n" +
                "Unsubscribing: every newsletter email has an 'Unsubscribe' link in the footer — one click, no sign-in " +
                "required. Signed-in customers can also turn it off in Account -> Settings. Unsubscribing stops marketing " +
                "emails only; order receipts and account security emails still arrive.\n" +
                "If someone says they keep receiving emails after unsubscribing, or never receive the confirmation email, " +
                "collect their email address and hand off to a specialist."),
    };

    private readonly ISupportKnowledgeStore _store;

    public SupportKnowledgeBase(ISupportKnowledgeStore store)
    {
        _store = store;
    }

    public async Task<string> BuildContextBlockAsync(string query, int limit, int maxArticleChars = 0)
    {
        if (string.IsNullOrWhiteSpace(query) || limit <= 0)
        {
            return string.Empty;
        }

        var terms = Tokenize(query);
        if (terms.Count == 0)
        {
            return string.Empty;
        }

        var articles = await _store.GetActiveAsync();
        var matched = articles
            .Select(article => (article, score: Score(article, terms)))
            .Where(item => item.score > 0)
            .OrderByDescending(item => item.score)
            .Take(limit)
            .Select(item => item.article)
            .ToList();

        if (matched.Count == 0)
        {
            return string.Empty;
        }

        var builder = new System.Text.StringBuilder();
        builder.AppendLine("KNOWLEDGE BASE (Tale Shop policies — treat as the single source of truth):");
        foreach (var article in matched)
        {
            builder.AppendLine($"### {article.Title} [{article.Category}]");
            builder.AppendLine(Trim(article.Content, maxArticleChars));
            builder.AppendLine();
        }

        return builder.ToString().TrimEnd();
    }

    /// <summary>
    /// Обрезает статью по границе строки: этот блок уходит в каждый запрос и оплачивается
    /// целиком, а обрывать инструкцию посреди предложения — хуже, чем не дослать её вовсе.
    /// </summary>
    private static string Trim(string content, int maxChars)
    {
        if (maxChars <= 0 || content.Length <= maxChars)
        {
            return content;
        }

        var cut = content[..maxChars];
        var boundary = cut.LastIndexOfAny(new[] { '\n', '.' });
        return boundary > maxChars / 2 ? cut[..(boundary + 1)] : cut;
    }

    private static double Score(SuperBot.WebApi.Support.Chat.Models.SupportKnowledgeArticle article, IReadOnlyCollection<string> terms)
    {
        double score = 0;
        var keywordSet = new HashSet<string>(article.Keywords, StringComparer.OrdinalIgnoreCase);
        var titleTokens = new HashSet<string>(Tokenize(article.Title), StringComparer.OrdinalIgnoreCase);
        var contentLower = article.Content.ToLowerInvariant();

        foreach (var term in terms)
        {
            if (keywordSet.Contains(term))
            {
                score += 3; // curated keyword hit — strongest signal
            }
            else if (titleTokens.Contains(term))
            {
                score += 2;
            }
            else if (contentLower.Contains(term, StringComparison.Ordinal))
            {
                score += 1;
            }
        }

        return score;
    }

    private static List<string> Tokenize(string text)
    {
        var tokens = new List<string>();
        foreach (var raw in text.Split(
                     new[] { ' ', '\t', '\n', '\r', ',', '.', '!', '?', ';', ':', '"', '\'', '(', ')', '/', '\\', '-' },
                     StringSplitOptions.RemoveEmptyEntries))
        {
            var token = raw.Trim().ToLower(CultureInfo.InvariantCulture);
            if (token.Length < 2 || StopWords.Contains(token))
            {
                continue;
            }

            tokens.Add(token);
        }

        return tokens;
    }
}
