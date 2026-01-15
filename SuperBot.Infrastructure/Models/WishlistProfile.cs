using AutoMapper;
using SuperBot.Core.Entities;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Models
{
    public class WishlistProfile : Profile
    {
        public WishlistProfile()
        {
            CreateMap<Wishlist, WishlistDb>().ReverseMap();
            CreateMap<WishlistGame, WishlistGameDb>().ReverseMap();
        }
    }
}
