using AutoMapper;
using SuperBot.Core.Entities;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Models
{
    public class GameProfile : Profile
    {
        public GameProfile()
        {
            CreateMap<Game, GameDb>().ReverseMap();
        }
    }

}
