using AutoMapper;
using SuperBot.Core.Entities;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Models
{
    public class MediaAssetProfile : Profile
    {
        public MediaAssetProfile()
        {
            CreateMap<MediaAsset, MediaAssetDb>().ReverseMap();
        }
    }
}
