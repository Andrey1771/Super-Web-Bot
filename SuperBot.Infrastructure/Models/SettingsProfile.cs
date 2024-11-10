using AutoMapper;
using SuperBot.Core.Entities;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Models
{
    public class SettingsProfile : Profile
    {
        public SettingsProfile()
        {
            CreateMap<Settings, SettingsDb>().ReverseMap();
        }
    }
}
