using AutoMapper;
using SuperBot.Core.Entities;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Models
{
    public class OrderProfile : Profile
    {
        public OrderProfile()
        {
            CreateMap<MoneyTotals, MoneyTotalsDb>().ReverseMap();
            CreateMap<OrderEvent, OrderEventDb>().ReverseMap();
            CreateMap<PricingSnapshot, PricingSnapshotDb>().ReverseMap();
            CreateMap<DeliveredKey, DeliveredKeyDb>().ReverseMap();
            CreateMap<DeliverySnapshot, DeliverySnapshotDb>().ReverseMap();

            // Позиция заказа маппится один в один. Раньше здесь синхронизировались
            // legacy-дубли каждого поля (TitleSnapshot, Qty, UnitPriceSnapshot и т.д.) —
            // они удалены, остался только идентификатор позиции.
            CreateMap<OrderItemSnapshot, OrderItemSnapshotDb>()
                .AfterMap((src, dest) =>
                {
                    dest.ItemId = string.IsNullOrWhiteSpace(src.ItemId) ? Guid.NewGuid().ToString("N") : src.ItemId;
                });

            CreateMap<OrderItemSnapshotDb, OrderItemSnapshot>();

            CreateMap<Order, OrderDb>()
                .ForMember(dest => dest.Id, opt => opt.Ignore())
                .ForMember(dest => dest.OrderId, opt => opt.MapFrom(src => src.Id.ToString()))
                .AfterMap((src, dest) =>
                {
                    var guid = src.OrderGuid == Guid.Empty ? src.Id : src.OrderGuid;
                    dest.OrderGuid = guid;
                    dest.UserId = string.IsNullOrWhiteSpace(src.UserId) ? src.UserName : src.UserId;
                    dest.OrderNumber = string.IsNullOrWhiteSpace(src.OrderNumber)
                        ? $"TS-{src.OrderDate:yyyyMMdd}-{guid.ToString("N")[..6].ToUpperInvariant()}"
                        : src.OrderNumber;

                    dest.CreatedAt = src.CreatedAt == default ? src.OrderDate : src.CreatedAt;
                    dest.Totals = new MoneyTotalsDb
                    {
                        Subtotal = src.SubtotalAmount ?? src.Totals.Subtotal,
                        DiscountTotal = src.DiscountTotal ?? src.Totals.DiscountTotal,
                        TaxTotal = src.TaxTotal ?? src.Totals.TaxTotal,
                        Total = src.TotalAmount ?? src.Totals.Total
                    };
                });

            CreateMap<OrderDb, Order>()
                .ForMember(dest => dest.Id, opt => opt.MapFrom(src => ParseOrderId(src.OrderId, src.OrderGuid)))
                .AfterMap((src, dest) =>
                {
                    dest.OrderGuid = src.OrderGuid == Guid.Empty ? ParseOrderId(src.OrderId, Guid.Empty) : src.OrderGuid;
                    dest.UserId = string.IsNullOrWhiteSpace(src.UserId) ? src.UserName : src.UserId;
                    dest.OrderNumber = string.IsNullOrWhiteSpace(src.OrderNumber) ? src.OrderId : src.OrderNumber;
                    dest.CreatedAt = src.CreatedAt == default ? src.OrderDate : src.CreatedAt;
                    dest.SubtotalAmount ??= src.Totals.Subtotal;
                    dest.DiscountTotal ??= src.Totals.DiscountTotal;
                    dest.TaxTotal ??= src.Totals.TaxTotal;
                    dest.TotalAmount ??= src.Totals.Total;
                });
        }

        private static Guid ParseOrderId(string? orderId, Guid fallback)
        {
            if (Guid.TryParse(orderId, out var parsed))
            {
                return parsed;
            }

            return fallback == Guid.Empty ? Guid.NewGuid() : fallback;
        }
    }
}
