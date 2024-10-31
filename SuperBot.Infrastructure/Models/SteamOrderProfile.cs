using AutoMapper;
using SuperBot.Core.Entities;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Models
{
    public class SteamOrderProfile : Profile
    {
        public SteamOrderProfile()
        {
            CreateMap<SteamOrder, SteamOrderDb>().ReverseMap();
        }
    }
}
