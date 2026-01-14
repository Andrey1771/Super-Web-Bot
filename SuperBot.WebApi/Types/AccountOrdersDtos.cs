using System;
using System.Collections.Generic;

namespace SuperBot.WebApi.Types
{
    public class AccountOrdersResponse
    {
        public List<AccountOrderDto> Items { get; set; } = new();
        public int Page { get; set; }
        public int PageSize { get; set; }
        public int Total { get; set; }
    }

    public class AccountOrderDto
    {
        public string OrderId { get; set; }
        public DateTime CreatedAt { get; set; }
        public string Status { get; set; }
        public string Currency { get; set; }
        public decimal Total { get; set; }
        public List<AccountOrderItemDto> Items { get; set; } = new();
        public bool HasInvoice { get; set; }
        public string InvoiceId { get; set; }
        public bool KeysAvailable { get; set; }
        public int KeysCount { get; set; }
    }

    public class AccountOrderItemDto
    {
        public string GameId { get; set; }
        public string Title { get; set; }
        public string CoverUrl { get; set; }
        public int Qty { get; set; }
    }
}
