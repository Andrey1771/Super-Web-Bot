using System.Text;
using SuperBot.Core.Entities;

namespace SuperBot.WebApi.Services
{
    public static class InvoicePdfBuilder
    {
        public static byte[] Build(Order order, string? customerEmail)
        {
            var lines = new List<string>
            {
                $"Invoice #{order.Id}",
                $"Game: {order.GameName}",
                $"Date: {order.OrderDate:yyyy-MM-dd}",
                string.IsNullOrWhiteSpace(customerEmail) ? "Customer: —" : $"Customer: {customerEmail}"
            };

            var text = string.Join("\\n", lines);
            return BuildSimplePdf(text);
        }

        private static byte[] BuildSimplePdf(string text)
        {
            var sanitizedText = text
                .Replace("\\", "\\\\")
                .Replace("(", "\\(")
                .Replace(")", "\\)");

            var content = $"BT /F1 18 Tf 72 720 Td ({sanitizedText}) Tj ET";

            var objects = new List<string>
            {
                "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj",
                "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj",
                "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj",
                $"4 0 obj<< /Length {content.Length} >>stream\n{content}\nendstream\nendobj",
                "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj"
            };

            var builder = new StringBuilder();
            builder.Append("%PDF-1.4\n");

            var offsets = new List<int>();
            foreach (var obj in objects)
            {
                offsets.Add(builder.Length);
                builder.Append(obj).Append('\n');
            }

            var xrefPosition = builder.Length;
            builder.Append("xref\n0 ").Append(objects.Count + 1).Append("\n");
            builder.Append("0000000000 65535 f \n");

            foreach (var offset in offsets)
            {
                builder.Append(offset.ToString("D10")).Append(" 00000 n \n");
            }

            builder.Append("trailer<< /Size ")
                .Append(objects.Count + 1)
                .Append(" /Root 1 0 R >>\n");
            builder.Append("startxref\n").Append(xrefPosition).Append("\n%%EOF");

            return Encoding.ASCII.GetBytes(builder.ToString());
        }
    }
}
