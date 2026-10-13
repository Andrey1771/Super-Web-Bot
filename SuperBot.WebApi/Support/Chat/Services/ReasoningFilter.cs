using System.Text;
using System.Text.RegularExpressions;

namespace SuperBot.WebApi.Support.Chat.Services;

/// <summary>
/// Strips model "reasoning" output (e.g. &lt;think&gt;...&lt;/think&gt; blocks emitted by reasoning models
/// such as deepseek-r1) so raw chain-of-thought never reaches the customer. The default model
/// (qwen2.5) does not emit these, so this is defensive — it makes the agent safe regardless of
/// which Ollama model is configured.
/// </summary>
public static partial class ReasoningFilter
{
    private const string OpenTag = "<think>";

    [GeneratedRegex(@"<think>.*?</think>", RegexOptions.Singleline | RegexOptions.IgnoreCase)]
    private static partial Regex ThinkBlockRegex();

    /// <summary>Removes complete reasoning blocks and any trailing unclosed block from a full string.</summary>
    public static string Strip(string text)
    {
        if (string.IsNullOrEmpty(text) || !text.Contains("<think", StringComparison.OrdinalIgnoreCase))
        {
            return text;
        }

        var stripped = ThinkBlockRegex().Replace(text, string.Empty);

        // An unclosed <think> (model still reasoning, or truncated) — drop everything from it on.
        var openIndex = stripped.IndexOf(OpenTag, StringComparison.OrdinalIgnoreCase);
        if (openIndex >= 0)
        {
            stripped = stripped[..openIndex];
        }

        return stripped;
    }

    /// <summary>
    /// Creates a stateful filter for streaming: feed raw chunks, receive only the visible delta.
    /// </summary>
    public static StreamFilter CreateStreamFilter() => new();

    public sealed class StreamFilter
    {
        private readonly StringBuilder _raw = new();
        private int _emittedLength;

        /// <summary>Feeds a raw chunk and returns the newly-visible text (empty while inside reasoning).</summary>
        public string Push(string chunk)
        {
            if (string.IsNullOrEmpty(chunk))
            {
                return string.Empty;
            }

            _raw.Append(chunk);
            var visible = SafeVisible(_raw.ToString());
            if (visible.Length <= _emittedLength)
            {
                return string.Empty;
            }

            var delta = visible[_emittedLength..];
            _emittedLength = visible.Length;
            return delta;
        }

        // Like Strip, but also holds back a trailing partial tag opener (e.g. "<th") so a split
        // "<think>" is never surfaced to the user mid-stream.
        private static string SafeVisible(string text)
        {
            var stripped = Strip(text);
            var holdback = TrailingOpenTagPrefixLength(stripped);
            return holdback > 0 ? stripped[..^holdback] : stripped;
        }

        private static int TrailingOpenTagPrefixLength(string text)
        {
            var maxLen = Math.Min(OpenTag.Length - 1, text.Length);
            for (var len = maxLen; len > 0; len--)
            {
                if (text.AsSpan(text.Length - len).Equals(OpenTag.AsSpan(0, len), StringComparison.OrdinalIgnoreCase))
                {
                    return len;
                }
            }

            return 0;
        }
    }
}
