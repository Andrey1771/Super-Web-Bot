namespace SuperBot.WebApi.DTOs
{
    public class AccountOverviewDto
    {
        public AccountUserDto User { get; set; }
        public AccountCountersDto Counters { get; set; }
        public IEnumerable<AccountRecentOrderDto> RecentOrders { get; set; }
        public IEnumerable<AccountRecentKeyDto> RecentKeys { get; set; }
        public IEnumerable<AccountRecommendationDto>? Recommendations { get; set; }
    }

    public class AccountUserDto
    {
        public string? Id { get; set; }
        public string? DisplayName { get; set; }
        public string? Email { get; set; }
        public bool VerifiedBuyer { get; set; }
        public DateTime? MemberSince { get; set; }
        public string? AvatarUrl { get; set; }
    }

    public class AccountCountersDto
    {
        public int OrdersCount { get; set; }
        public int ActiveKeysCount { get; set; }
        public int SavedItemsCount { get; set; }
        public int PaymentMethodsCount { get; set; }
    }

    public class AccountRecentOrderDto
    {
        public string OrderId { get; set; }
        public string GameTitle { get; set; }
        public DateTime Date { get; set; }
        public decimal? Amount { get; set; }
        public string? Currency { get; set; }
        public string? Status { get; set; }
        public string? InvoiceId { get; set; }
    }

    public class AccountRecentKeyDto
    {
        public string GameTitle { get; set; }
        public string? Platform { get; set; }
        public DateTime? PurchaseDate { get; set; }
        public string? KeyId { get; set; }
        public bool HasKey { get; set; }
    }

    public class AccountRecommendationDto
    {
        public string GameId { get; set; }
        public string Title { get; set; }
        public decimal Price { get; set; }
        public string? CoverUrl { get; set; }
        public int? SalePercent { get; set; }
    }
}
