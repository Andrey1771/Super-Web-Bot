using AutoMapper;
using SuperBot.Core.Entities;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Models
{
    public class UserProfile : Profile
    {
        public UserProfile()
        {
            CreateMap<User, UserDb>().ReverseMap();
        }
    }
}
