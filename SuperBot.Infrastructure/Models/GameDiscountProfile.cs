using AutoMapper;
using SuperBot.Core.Entities;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Models;

public class GameDiscountProfile : Profile
{
    public GameDiscountProfile()
    {
        CreateMap<GameDiscount, GameDiscountDb>().ReverseMap();
    }
}
