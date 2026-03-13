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

            CreateMap<OrderItemSnapshot, OrderItemSnapshotDb>()
                .AfterMap((src, dest) =>
                {
                    dest.ItemId = string.IsNullOrWhiteSpace(src.ItemId) ? Guid.NewGuid().ToString("N") : src.ItemId;
                    dest.TitleSnapshot = string.IsNullOrWhiteSpace(src.TitleSnapshot) ? src.Title : src.TitleSnapshot;
                    dest.CoverUrlSnapshot ??= src.CoverUrl;
                    dest.PlatformSnapshot ??= src.Platform;
                    dest.RegionSnapshot ??= src.Region;
                    dest.Qty = src.Qty > 0 ? src.Qty : src.Quantity;
                    dest.UnitPriceSnapshot = src.UnitPriceSnapshot > 0 ? src.UnitPriceSnapshot : src.UnitPrice;
                    dest.DiscountSnapshot ??= src.UnitDiscount;
                    dest.FinalUnitPriceSnapshot = src.FinalUnitPriceSnapshot > 0 ? src.FinalUnitPriceSnapshot : src.FinalUnitPrice;
                    dest.LineTotalSnapshot = src.LineTotalSnapshot > 0 ? src.LineTotalSnapshot : src.LineTotal;
                    dest.DeliveryType ??= src.Delivery?.DeliveryType;
                });

            CreateMap<OrderItemSnapshotDb, OrderItemSnapshot>()
                .AfterMap((src, dest) =>
                {
                    dest.Title = string.IsNullOrWhiteSpace(src.Title) ? src.TitleSnapshot : src.Title;
                    dest.CoverUrl ??= src.CoverUrlSnapshot;
                    dest.Platform ??= src.PlatformSnapshot;
                    dest.Region ??= src.RegionSnapshot;
                    dest.Quantity = src.Quantity > 0 ? src.Quantity : src.Qty;
                    dest.UnitPrice = src.UnitPrice > 0 ? src.UnitPrice : src.UnitPriceSnapshot;
                    dest.UnitDiscount = src.UnitDiscount > 0 ? src.UnitDiscount : src.DiscountSnapshot ?? 0m;
                    dest.FinalUnitPrice = src.FinalUnitPrice > 0 ? src.FinalUnitPrice : src.FinalUnitPriceSnapshot;
                    dest.LineTotal = src.LineTotal > 0 ? src.LineTotal : src.LineTotalSnapshot;
                    dest.Delivery ??= string.IsNullOrWhiteSpace(src.DeliveryType)
                        ? null
                        : new DeliverySnapshot { DeliveryType = src.DeliveryType };

                    dest.TitleSnapshot = string.IsNullOrWhiteSpace(src.TitleSnapshot) ? dest.Title : src.TitleSnapshot;
                    dest.Qty = src.Qty > 0 ? src.Qty : dest.Quantity;
                    dest.UnitPriceSnapshot = src.UnitPriceSnapshot > 0 ? src.UnitPriceSnapshot : dest.UnitPrice;
                    dest.DiscountSnapshot ??= src.DiscountSnapshot ?? dest.UnitDiscount;
                    dest.FinalUnitPriceSnapshot = src.FinalUnitPriceSnapshot > 0 ? src.FinalUnitPriceSnapshot : dest.FinalUnitPrice;
                    dest.LineTotalSnapshot = src.LineTotalSnapshot > 0 ? src.LineTotalSnapshot : dest.LineTotal;
                    dest.DeliveryType ??= src.DeliveryType;
                });

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
