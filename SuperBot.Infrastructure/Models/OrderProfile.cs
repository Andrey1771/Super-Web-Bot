using AutoMapper;
using SuperBot.Core.Entities;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Models
{
    public class OrderProfile : Profile
    {
        public OrderProfile()
        {
            CreateMap<Order, OrderDb>()
                .ForMember(dest => dest.Id, opt => opt.Ignore())
                .ForMember(dest => dest.OrderId, opt => opt.MapFrom(src => src.Id.ToString()));

            CreateMap<OrderDb, Order>()
                .ForMember(dest => dest.Id, opt => opt.MapFrom(src => ParseOrderId(src.OrderId)));
        }

        private static Guid ParseOrderId(string? orderId)
        {
            return Guid.TryParse(orderId, out var parsed) ? parsed : Guid.Empty;
        }
    }
}
