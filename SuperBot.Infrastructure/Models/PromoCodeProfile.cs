using AutoMapper;
using SuperBot.Core.Entities;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Models;

public class PromoCodeProfile : Profile
{
    public PromoCodeProfile()
    {
        CreateMap<PromoCode, PromoCodeDb>().ReverseMap();
        CreateMap<PromoCodeUsage, PromoCodeUsageDb>().ReverseMap();
    }
}
