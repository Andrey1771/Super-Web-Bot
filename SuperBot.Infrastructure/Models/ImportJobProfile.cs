using AutoMapper;
using SuperBot.Core.Entities;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Models
{
    public class ImportJobProfile : Profile
    {
        public ImportJobProfile()
        {
            CreateMap<ImportJob, ImportJobDb>().ReverseMap();
            CreateMap<ImportJobStats, ImportJobStatsDb>().ReverseMap();
            CreateMap<ImportIssue, ImportIssueDb>().ReverseMap();
        }
    }
}
