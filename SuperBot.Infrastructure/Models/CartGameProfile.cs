using AutoMapper;
using SuperBot.Core.Entities;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Models
{
    class CartGameProfile : Profile
    {
        public CartGameProfile()
        {
            CreateMap<CartGame, CartGameDb>().ReverseMap();
        }
    }
}
