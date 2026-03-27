using AutoMapper;
using SuperBot.Core.Entities;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Models
{
    public class AnalyticsSettingsProfile : Profile
    {
        public AnalyticsSettingsProfile()
        {
            CreateMap<AnalyticsSettings, AnalyticsSettingsDb>().ReverseMap();
        }
    }
}
